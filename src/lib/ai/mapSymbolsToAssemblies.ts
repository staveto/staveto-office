/**
 * Map resolved symbols → assembly templates → takeoff / product intents / questions.
 */

import {
  ELECTRICAL_ASSEMBLY_TEMPLATES,
  QUOTE_GROUP_LABELS_SK,
  findAssemblyTemplate,
  type AssemblyQuoteGroup,
  type ElectricalAssemblyTemplate,
  type NormalizedElectricalPoint,
} from "./electricalAssemblyTemplates";
import {
  resolveDrawingSymbol,
  type CompanySymbolMapping,
  type DrawingSymbolCandidate,
  type LegendLike,
  type ResolvedDrawingSymbol,
} from "./symbolResolver";
import type { ProductSearchIntent } from "@/lib/products/productSourcingTypes";
import type { ProductCategory } from "@/lib/products/productSourcingTypes";

export type SymbolOccurrenceLike = {
  id: string;
  title: string;
  visibleLabel?: string;
  roomName?: string;
  quantity?: number | null;
  unit?: string;
  page?: number;
  normalizedType?: string;
  legendEntryId?: string;
  needsReview?: boolean;
  reviewReason?: string;
  overlapped?: boolean;
};

export type AssemblyMaterialLine = {
  category: ProductCategory;
  title: string;
  quantity: number | null;
  unit: string;
  productRequired: boolean;
  priceRequired: boolean;
  requiredSpecs: string[];
  missingSpecs: string[];
  needsReview: boolean;
};

export type AssemblyLaborLine = {
  title: string;
  hours: number | null;
  unit: "h";
  needsReview: boolean;
};

export type AssemblyInstance = {
  id: string;
  sourceSymbolId: string;
  recognizedAs: string;
  sourceType: ResolvedDrawingSymbol["sourceType"];
  normalizedPoint: NormalizedElectricalPoint;
  assemblyTemplateId: string;
  assemblyTitle: string;
  quoteGroup: AssemblyQuoteGroup;
  quoteGroupLabelSk: string;
  roomName?: string;
  quantity: number | null;
  unit: string;
  materialLines: AssemblyMaterialLine[];
  laborLines: AssemblyLaborLine[];
  requiredQuestions: string[];
  assumptions: string[];
  riskFlags: string[];
  needsReview: boolean;
  reviewReason?: string;
  priceStatus: "missing" | "partial" | "ready" | "review_only";
};

export type MapSymbolsToAssembliesResult = {
  resolvedSymbols: ResolvedDrawingSymbol[];
  assemblies: AssemblyInstance[];
  reviewOnlySymbols: ResolvedDrawingSymbol[];
  quoteGroups: { id: AssemblyQuoteGroup; titleSk: string; assemblyIds: string[] }[];
  productSearchIntents: ProductSearchIntent[];
  missingQuestions: string[];
  risks: string[];
  blocksFixedQuote: boolean;
};

export type MapSymbolsOptions = {
  legendEntries?: LegendLike[];
  companyCustomMappings?: CompanySymbolMapping[];
  userConfirmedMappings?: CompanySymbolMapping[];
  countryCode?: string;
  knownSpecs?: Record<string, string | number | boolean>;
  includeTestingRevision?: boolean;
  preferredBrand?: string;
  /** Knowledge-backend symbol entries (Firestore/seed) — overrides starter profile. */
  standardLibrary?: import("./electricalSymbolLibrary").SymbolLibraryEntry[];
  /** Knowledge-backend assembly templates (Firestore/seed) — checked before in-code templates. */
  assemblyTemplates?: ElectricalAssemblyTemplate[];
};

function evalQtyFormula(
  formula: string,
  qty: number | null
): number | null {
  if (formula === "needs_measure" || formula === "needs_spec") return null;
  if (formula === "1") return 1;
  if (formula === "qty") return qty;
  if (formula === "qty * 2" && qty != null) return qty * 2;
  if (formula === "qty * 1.08" && qty != null) return Math.round(qty * 1.08 * 1000) / 1000;
  if (formula.startsWith("max(") || formula.startsWith("ceil(")) {
    // Keep null until specs known — do not invent
    if (qty == null) return null;
    if (formula.includes("qty / 5")) return Math.max(2, Math.ceil(qty / 5));
    return null;
  }
  if (formula.includes("qty") && qty != null) {
    const m = formula.match(/qty\s*\*\s*([\d.]+)/);
    if (m) return Math.round(qty * Number(m[1]) * 1000) / 1000;
  }
  return null;
}

function evalHours(
  formula: string,
  qty: number | null,
  minutesPerUnit?: number
): number | null {
  if (formula === "needs_measure" || formula === "needs_spec") return null;
  if (formula === "1") return 1;
  if (formula === "0.5") return 0.5;
  if (formula.includes("qty") && qty != null) {
    const m = formula.match(/qty\s*\*\s*([\d.]+)/);
    if (m) return Math.round(qty * Number(m[1]) * 100) / 100;
  }
  if (minutesPerUnit != null && qty != null) {
    return Math.round(((minutesPerUnit * qty) / 60) * 100) / 100;
  }
  return null;
}

function occurrenceToCandidate(o: SymbolOccurrenceLike): DrawingSymbolCandidate {
  return {
    id: o.id,
    symbolLabel: o.visibleLabel,
    textNearSymbol: o.title,
    title: o.title,
    aiGuessType: o.normalizedType,
    aiGuessLabel: o.title,
    overlapped: o.overlapped,
    page: o.page,
    roomName: o.roomName,
    quantity: o.quantity ?? undefined,
    unit: o.unit,
  };
}

/** Expand a resolved symbol through a template into materials + labor lines. */
export function expandAssembly(
  resolved: ResolvedDrawingSymbol,
  template: ElectricalAssemblyTemplate,
  knownSpecs: Record<string, string | number | boolean>
): AssemblyInstance {
  const qty = resolved.quantity ?? null;
  const materialLines: AssemblyMaterialLine[] = template.materialComponents.map((c) => {
    const missing = (c.requiredSpecs ?? []).filter((s) => knownSpecs[s] == null);
    const quantity = evalQtyFormula(c.quantityFormula, qty);
    const needsReview =
      missing.length > 0 ||
      quantity == null ||
      c.quantityFormula === "needs_measure" ||
      c.quantityFormula === "needs_spec";
    return {
      category: c.category,
      title: c.title,
      quantity,
      unit: c.unit,
      productRequired: c.productRequired,
      priceRequired: c.priceRequired,
      requiredSpecs: c.requiredSpecs ?? [],
      missingSpecs: missing,
      needsReview,
    };
  });

  const laborLines: AssemblyLaborLine[] = template.laborComponents.map((l) => {
    const hours = evalHours(l.timeFormula, qty, l.defaultMinutesPerUnit);
    return {
      title: l.title,
      hours,
      unit: "h" as const,
      needsReview: hours == null,
    };
  });

  const hasMissingProduct = materialLines.some(
    (m) => m.productRequired && (m.needsReview || m.missingSpecs.length > 0)
  );
  const priceStatus: AssemblyInstance["priceStatus"] =
    resolved.normalizedPoint === "unknown"
      ? "review_only"
      : hasMissingProduct
        ? "missing"
        : materialLines.some((m) => m.priceRequired && m.quantity == null)
          ? "partial"
          : "ready";

  return {
    id: `asm_${resolved.candidateId ?? template.id}_${template.id}`,
    sourceSymbolId: resolved.candidateId ?? "unknown",
    recognizedAs: resolved.displayName,
    sourceType: resolved.sourceType,
    normalizedPoint: resolved.normalizedPoint,
    assemblyTemplateId: template.id,
    assemblyTitle: template.title,
    quoteGroup: template.quoteGroup,
    quoteGroupLabelSk: QUOTE_GROUP_LABELS_SK[template.quoteGroup],
    roomName: resolved.roomName,
    quantity: qty,
    unit: resolved.unit || template.defaultUnit,
    materialLines,
    laborLines,
    requiredQuestions: [...template.requiredQuestions],
    assumptions: [...template.assumptions],
    riskFlags: [...template.riskFlags],
    needsReview: resolved.needsReview || hasMissingProduct || priceStatus !== "ready",
    reviewReason: resolved.reviewReason,
    priceStatus,
  };
}

/** Product search intents for every product-required material in an assembly. */
export function intentsFromAssembly(
  assembly: AssemblyInstance,
  preferredBrand?: string
): ProductSearchIntent[] {
  const intents: ProductSearchIntent[] = [];
  for (const m of assembly.materialLines) {
    if (!m.productRequired) continue;
    const needsReviewReasons = [
      ...m.missingSpecs.map((s) => `Chýba špecifikácia: ${s}`),
      ...(m.quantity == null ? ["Množstvo nie je známe / treba zamerať."] : []),
    ];
    intents.push({
      takeoffItemId: `${assembly.id}__${m.category}`,
      title: `${m.title} (${assembly.recognizedAs})`,
      category: m.category,
      quantity: m.quantity ?? 0,
      unit: m.unit,
      keywords: [m.title, assembly.recognizedAs, preferredBrand].filter(Boolean) as string[],
      needsReviewReasons,
    });
  }
  return intents;
}

export function mapSymbolsToAssemblies(
  symbolOccurrences: SymbolOccurrenceLike[],
  options: MapSymbolsOptions = {}
): MapSymbolsToAssembliesResult {
  const knownSpecs = options.knownSpecs ?? {};
  const resolvedSymbols = symbolOccurrences.map((o) =>
    resolveDrawingSymbol(occurrenceToCandidate(o), {
      projectLegendEntries: options.legendEntries,
      companyCustomMappings: options.companyCustomMappings,
      userConfirmedMappings: options.userConfirmedMappings,
      countryCode: options.countryCode ?? "SK",
      standardLibrary: options.standardLibrary,
    })
  );

  const reviewOnlySymbols = resolvedSymbols.filter(
    (r) => r.normalizedPoint === "unknown" || r.sourceType === "unknown"
  );

  const findTemplate = (point: typeof resolvedSymbols[number]["normalizedPoint"]) =>
    options.assemblyTemplates?.find((t) => t.normalizedPoint === point) ??
    findAssemblyTemplate(point);

  const assemblies: AssemblyInstance[] = [];
  for (const resolved of resolvedSymbols) {
    if (resolved.normalizedPoint === "unknown") continue;
    const template = findTemplate(resolved.normalizedPoint);
    if (!template) continue;
    assemblies.push(expandAssembly(resolved, template, knownSpecs));
  }

  if (options.includeTestingRevision !== false && assemblies.length > 0) {
    const testing = ELECTRICAL_ASSEMBLY_TEMPLATES.find((t) => t.id === "testing_revision");
    if (testing && !assemblies.some((a) => a.assemblyTemplateId === "testing_revision")) {
      assemblies.push(
        expandAssembly(
          {
            matchedText: "Skúšky",
            displayName: "Skúšky a odovzdanie",
            normalizedPoint: "unknown",
            sourceType: "standard_reference_metadata",
            confidence: "medium",
            needsReview: true,
            reviewReason: "Potvrdiť, či je revízia v rozsahu.",
            quantity: 1,
            unit: "set",
          },
          testing,
          knownSpecs
        )
      );
    }
  }

  const groupMap = new Map<AssemblyQuoteGroup, string[]>();
  for (const a of assemblies) {
    if (a.normalizedPoint === "unknown" && a.assemblyTemplateId !== "testing_revision") continue;
    const list = groupMap.get(a.quoteGroup) ?? [];
    list.push(a.id);
    groupMap.set(a.quoteGroup, list);
  }

  const quoteGroups = [...groupMap.entries()].map(([id, assemblyIds]) => ({
    id,
    titleSk: QUOTE_GROUP_LABELS_SK[id],
    assemblyIds,
  }));

  const productSearchIntents = assemblies.flatMap((a) =>
    intentsFromAssembly(a, options.preferredBrand)
  );

  const missingQuestions = [
    ...new Set(assemblies.flatMap((a) => a.requiredQuestions)),
  ];
  const risks = [...new Set(assemblies.flatMap((a) => a.riskFlags))];

  const blocksFixedQuote =
    reviewOnlySymbols.length > 0 ||
    assemblies.some(
      (a) =>
        a.priceStatus === "missing" ||
        a.materialLines.some((m) => m.missingSpecs.length > 0 && m.priceRequired)
    ) ||
    assemblies.some((a) => a.riskFlags.includes("missing_led_specs"));

  return {
    resolvedSymbols,
    assemblies,
    reviewOnlySymbols,
    quoteGroups,
    productSearchIntents,
    missingQuestions,
    risks,
    blocksFixedQuote,
  };
}

export function validateAssembliesForFixedQuote(assemblies: AssemblyInstance[]): {
  ok: boolean;
  errors: string[];
  warnings: string[];
} {
  const errors: string[] = [];
  const warnings: string[] = [];
  for (const a of assemblies) {
    if (a.normalizedPoint === "unknown" && a.assemblyTemplateId !== "testing_revision") {
      errors.push(`Neznáma značka nie je v pevnej ponuke: ${a.recognizedAs}`);
    }
    for (const m of a.materialLines) {
      if (m.priceRequired && m.productRequired && (m.quantity == null || m.missingSpecs.length > 0)) {
        errors.push(`${a.assemblyTitle}: chýba produkt/cena alebo špecifikácia (${m.title})`);
      }
      if (m.priceRequired === false && m.quantity == null) {
        warnings.push(`${a.assemblyTitle}: ${m.title} — orientačné / treba zamerať`);
      }
    }
    if (a.riskFlags.includes("cable_length_not_measured")) {
      warnings.push(`${a.assemblyTitle}: dĺžka kábla nie je zameraná`);
    }
  }
  return { ok: errors.length === 0, errors, warnings };
}
