import { extractBrand, extractSeries } from "./brands";
import {
  categoryDocId,
  classifyElectricalProduct,
  ELECTRICAL_CATEGORY_TREE,
  ELECTRICAL_TRADE_ID,
  resolveCategoryNames,
} from "./category-rules";
import { buildBucoProductId, buildImportId } from "./ids";
import { resolveBucoImageUrl } from "./images";
import { cleanProductName, normalizeCatalogName } from "./normalizeName";
import { parseAvailability, parseEuroToCents, validatePricePair } from "./prices";
import { buildElectricalSearchTokens } from "./searchTokens";
import type {
  BucoRawProduct,
  ElectricalCatalogCategory,
  ElectricalCatalogImport,
  ElectricalCatalogProduct,
} from "./types";

export type BuildCatalogResult = {
  importDoc: ElectricalCatalogImport;
  categories: ElectricalCatalogCategory[];
  products: ElectricalCatalogProduct[];
  report: DryRunReport;
};

export type DryRunReport = {
  generatedAt: string;
  sourceFile: string;
  tradeId: string;
  supplierId: "buco";
  categoryCounts: Record<string, number>;
  productCounts: {
    total: number;
    active: number;
    needsReview: number;
    rejected: number;
  };
  classificationCounts: Record<string, number>;
  invalidPrices: Array<{
    productId: string;
    sku: string;
    reasons: string[];
    netRaw: string;
    grossRaw: string;
  }>;
  duplicateSkus: Array<{ sku: string; urls: string[] }>;
  unmatchedProducts: Array<{ productId: string; name: string; url: string }>;
  sampleNormalizedProducts: ElectricalCatalogProduct[];
};

export function buildElectricalCatalogFromProducts(input: {
  products: BucoRawProduct[];
  sourceFile: string;
  importId?: string;
  now?: Date;
}): BuildCatalogResult {
  const now = input.now ?? new Date();
  const nowIso = now.toISOString();
  const importId = input.importId ?? buildImportId();

  const categories = buildCategoryDocuments(nowIso);
  const categoryById = new Map(categories.map((c) => [c.id, c]));

  const skuToUrls = new Map<string, string[]>();
  const products: ElectricalCatalogProduct[] = [];
  const invalidPrices: DryRunReport["invalidPrices"] = [];
  const unmatchedProducts: DryRunReport["unmatchedProducts"] = [];
  const classificationCounts: Record<string, number> = {};
  const categoryCounts: Record<string, number> = {};

  for (const cat of categories) {
    categoryCounts[cat.name] = 0;
  }

  for (const raw of input.products) {
    if (!raw.url) continue;
    const sku = String(raw.kod ?? "").trim();
    if (sku) {
      const list = skuToUrls.get(sku) ?? [];
      list.push(raw.url);
      skuToUrls.set(sku, list);
    }

    const name = cleanProductName(raw.nazov ?? "", raw.url);
    const normalizedName = normalizeCatalogName(name);
    const productId = buildBucoProductId(sku, raw.url);

    const classification = classifyElectricalProduct({
      name,
      url: raw.url,
      sourceCategoryPath: raw.sourceCategoryPath,
      sourceCategoryName: raw.sourceCategoryName,
    });

    const { topName, childName } = resolveCategoryNames(
      classification.topSlug,
      classification.childSlug
    );
    const topId = categoryDocId(classification.topSlug);
    const childId = classification.childSlug
      ? categoryDocId(classification.childSlug, classification.topSlug)
      : topId;
    const categoryId = childId;
    const pathIds = classification.childSlug ? [topId, childId] : [topId];
    const pathNames = childName ? [topName, childName] : [topName];

    const classKey = pathNames.join(" › ");
    classificationCounts[classKey] = (classificationCounts[classKey] ?? 0) + 1;

    const netCents = parseEuroToCents(raw.cena_bez_dph);
    const grossCents = parseEuroToCents(raw.cena_s_dph);
    const pricing = validatePricePair(netCents, grossCents);
    if (pricing.priceStatus !== "valid") {
      invalidPrices.push({
        productId,
        sku,
        reasons: pricing.suspiciousReasons,
        netRaw: String(raw.cena_bez_dph ?? ""),
        grossRaw: String(raw.cena_s_dph ?? ""),
      });
    }

    const brand = extractBrand(name, raw.url);
    const series = extractSeries(name, raw.url);
    const availability = parseAvailability(raw.sklad);

    let status: ElectricalCatalogProduct["status"] = "active";
    if (classification.unmatched || pricing.priceStatus === "needs_review") {
      status = "needs_review";
    }
    if (!name.trim() || (!sku && !raw.url)) {
      status = "rejected";
    }

    const product: ElectricalCatalogProduct = {
      id: productId,
      tradeId: ELECTRICAL_TRADE_ID,
      categoryId,
      categoryPathIds: pathIds,
      categoryPathNames: pathNames,
      name,
      normalizedName,
      supplierSku: sku,
      brand,
      series,
      productType: classification.productType,
      unit: "ks",
      imageUrl: resolveBucoImageUrl(raw),
      attributes: classification.attributes,
      supplier: {
        supplierId: "buco",
        supplierName: "BUČO",
        sourceUrl: raw.url,
      },
      pricing: {
        currency: "EUR",
        netCents: pricing.netCents,
        grossCents: pricing.grossCents,
        priceStatus: pricing.priceStatus,
      },
      availability,
      searchTokens: buildElectricalSearchTokens({
        name,
        supplierSku: sku,
        brand,
        series,
        categoryPathNames: pathNames,
        productType: classification.productType,
      }),
      classificationConfidence: classification.confidence,
      status,
      importId,
      createdAt: nowIso,
      updatedAt: nowIso,
    };

    products.push(product);

    for (const id of pathIds) {
      const cat = categoryById.get(id);
      if (cat) {
        cat.productCount += 1;
        categoryCounts[cat.name] = (categoryCounts[cat.name] ?? 0) + 1;
      }
    }

    if (classification.unmatched) {
      unmatchedProducts.push({ productId, name, url: raw.url });
    }
  }

  const duplicateSkus = [...skuToUrls.entries()]
    .filter(([, urls]) => new Set(urls).size > 1)
    .map(([sku, urls]) => ({ sku, urls: [...new Set(urls)] }));

  // Deduplicate by product id (last write wins — upsert semantics)
  const byId = new Map<string, ElectricalCatalogProduct>();
  for (const p of products) byId.set(p.id, p);
  const uniqueProducts = [...byId.values()];

  const productsValid = uniqueProducts.filter((p) => p.status === "active").length;
  const productsNeedingReview = uniqueProducts.filter(
    (p) => p.status === "needs_review"
  ).length;
  const productsRejected = uniqueProducts.filter((p) => p.status === "rejected").length;

  const importDoc: ElectricalCatalogImport = {
    id: importId,
    countryCode: "SK",
    tradeId: ELECTRICAL_TRADE_ID,
    supplierId: "buco",
    sourceFile: input.sourceFile,
    status: "dry_run",
    categoriesFound: categories.length,
    productsFound: uniqueProducts.length,
    productsValid,
    productsNeedingReview,
    productsRejected,
    startedAt: nowIso,
    finishedAt: nowIso,
  };

  const report: DryRunReport = {
    generatedAt: nowIso,
    sourceFile: input.sourceFile,
    tradeId: ELECTRICAL_TRADE_ID,
    supplierId: "buco",
    categoryCounts,
    productCounts: {
      total: uniqueProducts.length,
      active: productsValid,
      needsReview: productsNeedingReview,
      rejected: productsRejected,
    },
    classificationCounts,
    invalidPrices: invalidPrices.slice(0, 200),
    duplicateSkus,
    unmatchedProducts: unmatchedProducts.slice(0, 200),
    sampleNormalizedProducts: uniqueProducts.slice(0, 25),
  };

  return { importDoc, categories, products: uniqueProducts, report };
}

function buildCategoryDocuments(nowIso: string): ElectricalCatalogCategory[] {
  const out: ElectricalCatalogCategory[] = [];
  let sort = 0;
  for (const top of ELECTRICAL_CATEGORY_TREE) {
    const topId = categoryDocId(top.slug);
    out.push({
      id: topId,
      tradeId: ELECTRICAL_TRADE_ID,
      parentId: null,
      name: top.name,
      normalizedName: normalizeCatalogName(top.name),
      slug: top.slug,
      level: 0,
      pathIds: [topId],
      pathNames: [top.name],
      sourceId: "buco",
      sourcePath: null,
      productCount: 0,
      isActive: true,
      sortOrder: sort++,
      createdAt: nowIso,
      updatedAt: nowIso,
    });
    for (const child of top.children ?? []) {
      const childId = categoryDocId(child.slug, top.slug);
      out.push({
        id: childId,
        tradeId: ELECTRICAL_TRADE_ID,
        parentId: topId,
        name: child.name,
        normalizedName: normalizeCatalogName(child.name),
        slug: child.slug,
        level: 1,
        pathIds: [topId, childId],
        pathNames: [top.name, child.name],
        sourceId: "buco",
        sourcePath: null,
        productCount: 0,
        isActive: true,
        sortOrder: sort++,
        createdAt: nowIso,
        updatedAt: nowIso,
      });
    }
  }
  return out;
}
