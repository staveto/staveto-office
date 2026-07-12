/**
 * Compose customer-facing QuotePackage from internal takeoff + quality gate.
 * Raw extraction must never become the main customer table.
 */

import { buildCableStrategy } from "./electricalCableStrategy";
import {
  qualityGateBlocksFixedQuote,
  qualityGateOpenPoints,
  validateElectricalEstimateCompleteness,
} from "./electricalQualityGate";
import type {
  InternalTakeoffRow,
  QuotePackage,
  QuotePackageGroupId,
  QuotePackageLine,
  QuotePackageSection,
} from "./electricalQuoteTypes";
import { QUOTE_GROUP_ORDER, QUOTE_GROUP_TITLES } from "./electricalQuoteTypes";

export type LaborRateDefaults = {
  perSocketPoint?: number;
  perSwitchPoint?: number;
  perLightPoint?: number;
  perLedMeter?: number;
  perChasingMeter?: number;
  distributionBoard?: number;
  testingFixed?: number;
  revisionFixed?: number;
  hourlyRate?: number;
};

export type ComposeElectricalQuoteInput = {
  takeoff: InternalTakeoffRow[];
  language?: "sk" | "de" | "en";
  projectName?: string;
  documentTextHints?: string[];
  legendTexts?: string[];
  laborRates?: LaborRateDefaults;
  materialPricesKnown?: boolean;
};

function sumQty(rows: InternalTakeoffRow[], pred: (r: InternalTakeoffRow) => boolean): number {
  return rows
    .filter((r) => r.included !== false && pred(r))
    .reduce((s, r) => s + (typeof r.quantity === "number" && r.quantity > 0 ? r.quantity : 0), 0);
}

function mapRowToGroup(row: InternalTakeoffRow): QuotePackageGroupId {
  if (row.category === "socket" || row.category === "switch") return "sockets_switches";
  if (row.category === "lighting") return "lighting";
  if (row.category === "led_strip") return "led";
  if (row.category === "cable") return "cabling";
  if (row.category === "distribution_board") return "distribution_board";
  if (row.category === "testing" || /revíz|skúšk|odovzdan/i.test(row.title)) return "testing";
  if (/dráž|draz|sekan|chasing/i.test(row.title)) return "wall_chasing";
  if (
    row.category === "installation_material" ||
    /krabica|chránič|svork|upevň/i.test(row.title)
  ) {
    return "installation_boxes";
  }
  if (row.category === "labor") {
    if (/dráž|draz/i.test(row.title)) return "wall_chasing";
    if (/rozvád/i.test(row.title)) return "distribution_board";
    if (/zásuv|vypína/i.test(row.title)) return "sockets_switches";
    if (/LED|sviet/i.test(row.title)) return "lighting";
    if (/skúšk|revíz|odovzdan/i.test(row.title)) return "testing";
    return "preparation";
  }
  return "other";
}

function aggregateByTitle(rows: InternalTakeoffRow[]): QuotePackageLine[] {
  const map = new Map<string, QuotePackageLine>();
  for (const r of rows) {
    if (r.included === false) continue;
    const groupId = mapRowToGroup(r);
    const key = `${groupId}|${r.title.trim().toLowerCase()}|${r.unit}`;
    const existing = map.get(key);
    const qty =
      typeof r.quantity === "number" && Number.isFinite(r.quantity) && r.quantity > 0
        ? r.quantity
        : undefined;
    if (existing) {
      if (qty != null) {
        existing.quantity = (existing.quantity ?? 0) + qty;
      }
      existing.needsReview = existing.needsReview || r.needsReview;
      continue;
    }
    map.set(key, {
      id: r.id,
      groupId,
      title: r.title.trim(),
      description: r.roomName ? undefined : r.reviewReason,
      quantity: qty,
      unit: r.unit || "ks",
      priceMissing: true,
      needsReview: r.needsReview,
      included: true,
      customerVisible: r.category !== "other",
      basis: r.roomName ? `Súčet miestností / zdroj: ${r.source}` : `Zdroj: ${r.source}`,
    });
  }
  return [...map.values()];
}

function ensureTemplateLabor(params: {
  takeoff: InternalTakeoffRow[];
  rates: LaborRateDefaults;
}): QuotePackageLine[] {
  const rows = params.takeoff;
  const rates = params.rates;
  const lines: QuotePackageLine[] = [];

  const sockets = sumQty(rows, (r) => r.category === "socket");
  const switches = sumQty(rows, (r) => r.category === "switch");
  const lights = sumQty(rows, (r) => r.category === "lighting");
  const ledM = sumQty(rows, (r) => r.category === "led_strip");

  const push = (
    groupId: QuotePackageGroupId,
    title: string,
    quantity: number | undefined,
    unit: string,
    unitPrice: number | undefined,
    needsReview?: boolean
  ) => {
    lines.push({
      id: `labor_${groupId}_${title.slice(0, 20)}`,
      groupId,
      title,
      quantity,
      unit,
      unitPrice,
      priceMissing: unitPrice == null || unitPrice <= 0,
      needsReview,
      included: true,
      customerVisible: true,
      basis: "Kalkulácia podľa kategórií výkazu (nie generických 16 h).",
    });
  };

  push("preparation", "Príprava, kontrola podkladov a obhliadka", 1, "pausal", rates.testingFixed ? rates.testingFixed * 0.3 : undefined, true);
  push("wall_chasing", "Drážkovanie / príprava trás", undefined, "m", rates.perChasingMeter, true);
  push(
    "sockets_switches",
    "Montáž a zapojenie zásuviek",
    sockets > 0 ? sockets : undefined,
    "ks",
    rates.perSocketPoint,
    sockets <= 0
  );
  push(
    "sockets_switches",
    "Montáž a zapojenie vypínačov",
    switches > 0 ? switches : undefined,
    "ks",
    rates.perSwitchPoint,
    switches <= 0
  );
  push(
    "lighting",
    "Montáž svetelných vývodov",
    lights > 0 ? lights : undefined,
    "ks",
    rates.perLightPoint,
    lights <= 0
  );
  push(
    "led",
    "Montáž LED pásov / profilov",
    ledM > 0 ? ledM : undefined,
    "m",
    rates.perLedMeter,
    ledM <= 0
  );
  push("distribution_board", "Osadenie a zapojenie rozvádzača", 1, "ks", rates.distributionBoard, true);
  push("cabling", "Zatiahnutie a ukončenie kabeláže", 1, "pausal", undefined, true);
  push("testing", "Skúšky, merania a odovzdanie", 1, "pausal", rates.testingFixed, false);
  push("testing", "Revízia / protokol (ak v rozsahu)", 1, "pausal", rates.revisionFixed, true);

  return lines;
}

function buildSections(
  materialLines: QuotePackageLine[],
  laborLines: QuotePackageLine[],
  language: "sk" | "de" | "en"
): QuotePackageSection[] {
  const all = [...materialLines, ...laborLines];
  const byGroup = new Map<QuotePackageGroupId, QuotePackageLine[]>();
  for (const line of all) {
    const list = byGroup.get(line.groupId) ?? [];
    list.push(line);
    byGroup.set(line.groupId, list);
  }

  const sections: QuotePackageSection[] = [];
  for (const id of QUOTE_GROUP_ORDER) {
    if (id === "assumptions" || id === "exclusions") continue;
    const lines = byGroup.get(id);
    if (!lines?.length) continue;
    const titles = QUOTE_GROUP_TITLES[id];
    sections.push({
      id,
      titleSk: titles.sk,
      titleEn: language === "de" ? titles.de : titles.en,
      lines,
    });
  }
  return sections;
}

export function takeoffFromMaterialLikeRows(
  rows: Array<{
    id: string;
    name: string;
    qty: number;
    unit: string;
    price?: number;
    included?: boolean;
    sourceNote?: string;
    confidence?: "low" | "medium" | "high";
    group?: string;
  }>
): InternalTakeoffRow[] {
  return rows.map((r) => {
    const note = r.sourceNote ?? "";
    const category =
      r.group === "socket"
        ? "socket"
        : r.group === "switch"
          ? "switch"
          : r.group === "lighting"
            ? /led/i.test(r.name)
              ? "led_strip"
              : "lighting"
            : r.group === "cable"
              ? "cable"
              : r.group === "install"
                ? "installation_material"
                : r.group === "labor"
                  ? "labor"
                  : /zásuv|zasuv|socket/i.test(r.name)
                    ? "socket"
                    : /vypína|vypina|switch/i.test(r.name)
                      ? "switch"
                      : /led/i.test(r.name)
                        ? "led_strip"
                        : /sviet|osvet/i.test(r.name)
                          ? "lighting"
                          : /kábel|kabel|cyky/i.test(r.name)
                            ? "cable"
                            : /krabica|rozvád/i.test(r.name)
                              ? "installation_material"
                              : /dráž|skúšk|montáž/i.test(r.name)
                                ? "labor"
                                : "other";

    return {
      id: r.id,
      title: r.name,
      category,
      quantity: r.qty > 0 ? r.qty : undefined,
      unit: r.unit || "ks",
      source: /legend/i.test(note)
        ? "project_legend"
        : /assumption|predpoklad/i.test(note)
          ? "assumption"
          : "symbol_occurrence",
      confidence: r.confidence ?? "medium",
      needsReview: /needsReview|chýba|treba|quantityMissing/i.test(note) || r.qty <= 0,
      reviewReason: note || undefined,
      included: r.included !== false,
    };
  });
}

/**
 * Build professional customer QuotePackage (grouped), not a flat raw extraction.
 */
export function composeElectricalCustomerQuote(
  input: ComposeElectricalQuoteInput
): QuotePackage {
  const language = input.language ?? "sk";
  const cable = buildCableStrategy({ takeoff: input.takeoff });
  const takeoff = [...input.takeoff, ...cable.rows];

  const findings = validateElectricalEstimateCompleteness({
    takeoff,
    documentTextHints: input.documentTextHints,
    legendTexts: input.legendTexts,
    language,
  });

  const materialLines = aggregateByTitle(
    takeoff.filter((r) => r.category !== "labor" && r.category !== "testing")
  );
  const laborLines = ensureTemplateLabor({
    takeoff,
    rates: input.laborRates ?? {
      perSocketPoint: undefined,
      perSwitchPoint: undefined,
      perLightPoint: undefined,
      perLedMeter: undefined,
      distributionBoard: undefined,
      testingFixed: undefined,
      revisionFixed: undefined,
    },
  });

  const sections = buildSections(materialLines, laborLines, language);
  const openPoints = qualityGateOpenPoints(findings);
  const blocked = qualityGateBlocksFixedQuote(findings);
  const anyPriceMissing =
    input.materialPricesKnown === false ||
    materialLines.some((l) => l.priceMissing) ||
    laborLines.some((l) => l.priceMissing);

  const assumptions = [
    ...cable.assumptions,
    "Ceny materiálu doplňte z firemného cenníka; 0 € nie je platná jednotková cena.",
    "Svietidlá / LED zdroje: potvrďte, či ich dodáva zákazník alebo firma.",
  ];

  const exclusions = [
    "Práce a materiál neuvedené v tejto ponuke.",
    "Zameranie káblových trás nad rámec predpokladov — po obhliadke sa môže upraviť cena.",
  ];

  const warnings: string[] = [];
  if (anyPriceMissing) {
    warnings.push("Ceny materiálu alebo práce chýbajú — ponuka je predbežná.");
  }
  if (blocked) {
    warnings.push("Chýbajú kritické kategórie výkazu — pevná cena je zablokovaná, kým ich nedoplníte.");
  }

  const intro =
    language === "sk"
      ? `Ďakujeme za dopyt${input.projectName ? ` k projektu „${input.projectName}“` : ""}. Nižšie je prehľadná cenová ponuka elektroprác podľa dostupnej dokumentácie.`
      : `Thank you for your enquiry${input.projectName ? ` regarding “${input.projectName}”` : ""}. Below is a grouped electrical quotation based on the available documentation.`;

  const scopeSummary =
    language === "sk"
      ? "Ponuka je členaná podľa profesionálnych sekcií (príprava, drážky, kabeláž, vývody, rozvádzač, skúšky). Detailný technický výkaz je interný / voliteľná príloha — nie hlavná tabuľka pre zákazníka."
      : "The quote is grouped into professional sections. The detailed technical takeoff is internal / optional appendix — not the main customer table.";

  return {
    language,
    intro,
    scopeSummary,
    sections,
    assumptions,
    exclusions,
    openPoints,
    validityNote:
      language === "sk"
        ? "Platnosť ponuky: 14 dní. Predbežné položky označené na kontrolu nie sú pevnou cenou."
        : "Validity: 14 days. Items marked for review are not a fixed price.",
    status: blocked ? "draft" : anyPriceMissing ? "preliminary" : "ready",
    blockedReasons: findings
      .filter((f) => f.blocksFixedQuote && f.status === "missing")
      .map((f) => f.messageSk),
    warnings,
  };
}
