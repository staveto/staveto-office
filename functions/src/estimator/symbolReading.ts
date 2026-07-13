/**
 * Legend-first technical symbol reading — conversion + validation layer.
 *
 * Human-in-the-loop, NOT an autonomous CAD parser. Symbol occurrences come from
 * Gemini vision (see buildElectricalSymbolReadingPrompt). This module turns those
 * drawing facts into what a company needs (quote lines, questions, risks, tasks)
 * and validates the output to catch common AI failure modes.
 */

import type {
  EstimatorFactsPayload,
  LegendEntryPayload,
  SymbolOccurrencePayload,
} from "./estimatorSchema";
import { resolveLegendNormalizedType } from "./electricalSymbolDictionary";

type ExtractedItemPayload = EstimatorFactsPayload["extractedItems"][number];

/** Grouped execution phases for electrical projects (worker-readable). */
export const ELECTRICAL_EXECUTION_PHASES = [
  "Príprava a kontrola podkladov",
  "Obhliadka a overenie otvorených bodov",
  "Hrubá elektroinštalácia / príprava trás",
  "Montáž vývodov a svetelných prvkov",
  "LED profily, LED pásy a osvetlenie",
  "Zapojenie, testovanie a odovzdanie",
] as const;

const SYMBOL_TO_CATEGORY: Record<string, ExtractedItemPayload["category"]> = {
  pendant_light: "lighting",
  ceiling_light: "lighting",
  wall_light: "lighting",
  mirror_light_output: "lighting",
  furniture_light: "lighting",
  led_strip: "led_strip",
  lighting_profile: "led_strip",
  socket: "socket",
  switch: "switch",
  distribution_board: "distribution_board",
  cable_route: "cable",
  unknown: "other",
};

function normalizeLegendEntry(l: LegendEntryPayload): LegendEntryPayload {
  const resolved = resolveLegendNormalizedType(
    l.normalizedType,
    l.symbolDescription,
    l.symbolLabel
  );
  if (resolved === l.normalizedType) return l;
  return { ...l, normalizedType: resolved };
}

function itemKey(room: string | undefined, title: string, qty: unknown, unit: unknown): string {
  return [
    (room ?? "").trim().toLowerCase(),
    title.trim().toLowerCase(),
    qty == null ? "" : String(qty),
    (unit == null ? "" : String(unit)).toLowerCase(),
  ].join("|");
}

function occurrenceToItem(s: SymbolOccurrencePayload): ExtractedItemPayload {
  const visuallyCounted =
    s.quantitySource === "drawing_detection" ||
    typeof s.detectedOccurrenceCount === "number";
  return {
    id: `item_${s.id}`,
    category: SYMBOL_TO_CATEGORY[s.normalizedType] ?? "other",
    roomName: s.roomName,
    title: s.title,
    symbolCode: s.visibleLabel?.trim() || undefined,
    quantity: s.quantity,
    unit: s.unit,
    quantitySource: s.quantitySource ?? (visuallyCounted ? "drawing_detection" : undefined),
    detectedOccurrenceCount: visuallyCounted
      ? (typeof s.detectedOccurrenceCount === "number"
          ? s.detectedOccurrenceCount
          : (s.quantity ?? null))
      : undefined,
    pageNumber: s.page,
    bbox: s.bbox,
    origin: s.origin === "missing" ? "missing" : "from_document",
    evidence: s.evidence,
    confidence: s.confidence,
    needsReview: s.needsReview,
    reviewReason: s.reviewReason,
  };
}

/** Legend row → takeoff line when plan occurrences were not counted. */
function legendEntryToItem(l: LegendEntryPayload): ExtractedItemPayload {
  const title =
    (l.symbolDescription || "").trim() ||
    (l.symbolLabel || "").trim() ||
    "Značka z legendy";
  const labelNote = l.symbolLabel?.trim()
    ? `Označenie v legende: ${l.symbolLabel.trim()}.`
    : "";
  return {
    id: `legend_item_${l.id}`,
    category: SYMBOL_TO_CATEGORY[l.normalizedType] ?? "other",
    title,
    symbolCode: l.symbolLabel?.trim() || undefined,
    description: [
      "Z legendy výkresu — počet výskytov vo výkrese ešte nie je spočítaný.",
      labelNote,
    ]
      .filter(Boolean)
      .join(" "),
    unit: l.unit ?? "ks",
    origin: "from_document",
    evidence: l.evidence ?? [],
    confidence: l.confidence === "high" ? "medium" : l.confidence,
    needsReview: true,
    reviewReason:
      "Položka z legendy bez spočítaných výskytov. Doplňte počet kusov / metrov pred pevnou cenou.",
  };
}

/** Sum occurrence rows that share type + room + title into one takeoff line. */
function aggregateOccurrencesToItems(
  occurrences: SymbolOccurrencePayload[]
): ExtractedItemPayload[] {
  type Acc = { item: ExtractedItemPayload; qty: number };
  const map = new Map<string, Acc>();
  for (const s of occurrences) {
    const key = [
      s.normalizedType,
      (s.roomName ?? "").trim().toLowerCase(),
      s.title.trim().toLowerCase(),
    ].join("|");
    const add =
      typeof s.quantity === "number" && Number.isFinite(s.quantity) && s.quantity > 0
        ? s.quantity
        : 1;
    const existing = map.get(key);
    if (existing) {
      existing.qty += add;
      if (s.needsReview) existing.item.needsReview = true;
      continue;
    }
    const item = occurrenceToItem(s);
    map.set(key, { item, qty: add });
  }
  return [...map.values()].map(({ item, qty }) => ({
    ...item,
    quantity: qty,
    computedQuantity: qty,
    detectedOccurrenceCount:
      item.quantitySource === "drawing_detection" ? qty : item.detectedOccurrenceCount,
    needsReview: item.needsReview || qty <= 0,
  }));
}

/**
 * Fold symbol occurrences into extractedItems (document facts have priority),
 * ensure unknown symbols are not lost, and build companyFocus if the model
 * did not provide it. Never overwrites visible document data with inferred rows.
 *
 * If a legend exists but occurrences were not counted, promote legend rows into
 * the takeoff so the company still sees every mark type from the drawing.
 *
 * For switches/sockets also expands company-needed companions (box, cable
 * assumption, labor) so the firm sees what "osadiť vypínač/zásuvku" requires —
 * cable meters stay needsReview because they cannot be measured from symbols alone.
 */
export function convertTechnicalDrawingFactsToEstimatorItems(
  facts: EstimatorFactsPayload
): EstimatorFactsPayload {
  const occurrences = facts.symbolOccurrences ?? [];
  const unknowns = facts.unknownSymbols ?? [];
  const legendEntries = facts.legendEntries ?? [];

  // Move unknown-typed occurrences into unknownSymbols so review never loses them.
  const cleanOccurrences = occurrences.filter((s) => s.normalizedType !== "unknown");
  const derivedUnknown = occurrences.filter((s) => s.normalizedType === "unknown");
  const allUnknown = [...unknowns, ...derivedUnknown];

  // Fold aggregated occurrences into extractedItems (dedupe against existing document rows).
  const existingKeys = new Set(
    facts.extractedItems.map((i) => itemKey(i.roomName, i.title, i.computedQuantity ?? i.quantity, i.unit))
  );
  const foldedItems: ExtractedItemPayload[] = [...facts.extractedItems];
  for (const row of aggregateOccurrencesToItems(cleanOccurrences)) {
    const key = itemKey(row.roomName, row.title, row.computedQuantity ?? row.quantity, row.unit);
    if (existingKeys.has(key)) continue;
    existingKeys.add(key);
    foldedItems.push(row);
  }

  // Attach occurrence totals onto matching legend-promoted / document rows by type+title.
  const qtyByTypeTitle = new Map<string, number>();
  for (const s of cleanOccurrences) {
    const k = `${s.normalizedType}|${s.title.trim().toLowerCase()}`;
    const add =
      typeof s.quantity === "number" && Number.isFinite(s.quantity) && s.quantity > 0
        ? s.quantity
        : 1;
    qtyByTypeTitle.set(k, (qtyByTypeTitle.get(k) ?? 0) + add);
  }
  for (let i = 0; i < foldedItems.length; i++) {
    const row = foldedItems[i]!;
    if (row.quantity != null || row.computedQuantity != null) continue;
    const cat = row.category;
    const typeGuess =
      cat === "lighting"
        ? ["pendant_light", "ceiling_light", "wall_light", "furniture_light", "mirror_light_output"]
        : cat === "led_strip"
          ? ["led_strip", "lighting_profile"]
          : cat === "socket"
            ? ["socket"]
            : cat === "switch"
              ? ["switch"]
              : cat === "distribution_board"
                ? ["distribution_board"]
                : cat === "cable"
                  ? ["cable_route"]
                  : [];
    let matched = 0;
    for (const t of typeGuess) {
      for (const [k, q] of qtyByTypeTitle) {
        if (k.startsWith(`${t}|`)) matched += q;
      }
    }
    const byTitle = qtyByTypeTitle.get(`unknown|${row.title.trim().toLowerCase()}`);
    if (byTitle) matched += byTitle;
    if (matched > 0) {
      foldedItems[i] = {
        ...row,
        quantity: matched,
        computedQuantity: matched,
        needsReview: row.needsReview,
        reviewReason: row.reviewReason,
      };
    }
  }

  // Legend promotion: always add legend mark types that are missing from takeoff,
  // even when lighting (or other) occurrences already exist. Lighting-only counts
  // must not hide zásuvky / vypínače that appear in the legend.
  const warnings = [...facts.warnings];
  const coveredTypes = new Set<string>();
  for (const s of cleanOccurrences) coveredTypes.add(s.normalizedType);
  for (const i of foldedItems) {
    if (i.category === "socket") coveredTypes.add("socket");
    if (i.category === "switch") coveredTypes.add("switch");
    if (i.category === "distribution_board") coveredTypes.add("distribution_board");
    if (i.category === "cable") coveredTypes.add("cable_route");
    if (i.category === "lighting") {
      for (const t of [
        "pendant_light",
        "ceiling_light",
        "wall_light",
        "furniture_light",
        "mirror_light_output",
      ]) {
        coveredTypes.add(t);
      }
    }
    if (i.category === "led_strip") {
      coveredTypes.add("led_strip");
      coveredTypes.add("lighting_profile");
    }
  }

  const normalizedLegend = legendEntries.map(normalizeLegendEntry);
  let promotedCount = 0;
  for (const l of normalizedLegend) {
    if (l.normalizedType === "unknown") continue;
    if (coveredTypes.has(l.normalizedType)) continue;
    const item = legendEntryToItem(l);
    const key = itemKey(item.roomName, item.title, item.quantity, item.unit);
    if (existingKeys.has(key)) continue;
    // Also skip if same title already present (any qty).
    const titleKey = `title:${item.title.trim().toLowerCase()}`;
    const hasTitle = [...existingKeys].some((k) => k.includes(`|${item.title.trim().toLowerCase()}|`));
    if (hasTitle) continue;
    existingKeys.add(key);
    existingKeys.add(titleKey);
    foldedItems.push(item);
    coveredTypes.add(l.normalizedType);
    promotedCount++;
  }

  const shouldPromoteLegend = promotedCount > 0;
  if (shouldPromoteLegend) {
    warnings.push(
      `Do výkazu boli doplnené značky z legendy, ktoré ešte neboli spočítané na pláne (${promotedCount}). Overte počty zásuviek, vypínačov a ostatných bodov pred pevnou cenou.`
    );
  }

  // Companions from counted occurrences OR from document takeoff rows with qty.
  const inferredExtra = [
    ...expandPointCompanions(cleanOccurrences, facts.inferredItems, foldedItems),
    ...expandElectricalInstallScope(foldedItems, facts.inferredItems),
  ];
  const existingInfKeys = new Set(
    facts.inferredItems.map((i) =>
      itemKey(i.roomName, i.title, i.computedQuantity ?? i.quantity, i.unit)
    )
  );
  const inferredItems = [...facts.inferredItems];
  for (const row of inferredExtra) {
    const key = itemKey(row.roomName, row.title, row.computedQuantity ?? row.quantity, row.unit);
    if (existingInfKeys.has(key)) continue;
    if (existingKeys.has(key)) continue;
    existingInfKeys.add(key);
    inferredItems.push(row);
  }

  let missingQuestions = ensureElectricalPointQuestions(facts, cleanOccurrences);
  if (shouldPromoteLegend) {
    const hasCountQ = missingQuestions.some((q) =>
      /počet|pocet|count|výskyt|vyskyt|legende|zásuv|vypína/i.test(`${q.question} ${q.reason}`)
    );
    if (!hasCountQ) {
      missingQuestions = [
        {
          id: "q_legend_counts",
          question:
            "Koľko kusov / bodov je na výkrese pre každú značku z legendy (zásuvky, vypínače, svietidlá) — overiť miestnosť po miestnosti?",
          reason:
            "AI doplnila typy z legendy, ale niektoré počty ešte nie sú spočítané. Bez počtov nie je bezpečné dať pevnú cenu.",
          importance: "critical" as const,
          blocksFixedQuote: true,
        },
        ...missingQuestions,
      ];
    }
  }

  const companyFocus =
    facts.companyFocus && facts.companyFocus.length > 0
      ? facts.companyFocus
      : buildCompanyFocusFallback(facts, cleanOccurrences, allUnknown);

  const rooms = mergeRoomsFromItems(facts.rooms ?? [], foldedItems);

  // Backfill symbolCode onto takeoff rows from legend labels / occurrence marks
  // so the review table can show the drawing code instead of "—".
  const codeByTitle = new Map<string, string>();
  for (const l of normalizedLegend) {
    const code = l.symbolLabel?.trim();
    if (code) codeByTitle.set(l.symbolDescription.trim().toLowerCase(), code);
  }
  for (const s of cleanOccurrences) {
    const code = s.visibleLabel?.trim();
    if (code) codeByTitle.set(s.title.trim().toLowerCase(), code);
  }
  for (let i = 0; i < foldedItems.length; i++) {
    const row = foldedItems[i]!;
    if (row.symbolCode) continue;
    const direct = codeByTitle.get(row.title.trim().toLowerCase());
    const embedded = extractMarkCodeFromTitle(row.title);
    const code = direct ?? embedded;
    if (code) foldedItems[i] = { ...row, symbolCode: code };
  }

  const symbolCounting = buildSymbolCountingSummary(cleanOccurrences);

  return {
    ...facts,
    rooms,
    legendEntries: normalizedLegend,
    extractedItems: foldedItems,
    inferredItems,
    missingQuestions,
    symbolOccurrences: cleanOccurrences,
    unknownSymbols: allUnknown,
    companyFocus,
    symbolCounting,
    warnings: [...new Set(warnings)],
  };
}

/** Trailing/embedded mark number in plan callouts, e.g. "LED pás 13" → "13". */
function extractMarkCodeFromTitle(title: string): string | undefined {
  const m = title.trim().match(/(?:^|\s)(\d{1,3})$/);
  return m ? m[1] : undefined;
}

/**
 * Honest drawing-count summary: only occurrences the model marked as visually
 * counted (quantitySource=drawing_detection or explicit detectedOccurrenceCount)
 * become detections. Schedule/legend-derived numbers stay out — no fake counts.
 */
function buildSymbolCountingSummary(
  occurrences: SymbolOccurrencePayload[]
): NonNullable<EstimatorFactsPayload["symbolCounting"]> {
  const detections = occurrences
    .filter(
      (s) =>
        s.quantitySource === "drawing_detection" ||
        typeof s.detectedOccurrenceCount === "number"
    )
    .map((s) => ({
      symbolCode: s.visibleLabel?.trim() || s.title,
      label: s.title,
      roomName: s.roomName,
      detectedOccurrenceCount:
        typeof s.detectedOccurrenceCount === "number"
          ? s.detectedOccurrenceCount
          : (typeof s.quantity === "number" ? s.quantity : null),
      confidence: s.confidence,
      bbox: s.bbox,
      source: "drawing_detection" as const,
      needsReview: s.needsReview,
      reviewReason: s.reviewReason,
      pageNumber: s.page,
    }));
  const hasReal = detections.some((d) => typeof d.detectedOccurrenceCount === "number");
  return {
    status: hasReal
      ? (detections.length >= occurrences.length ? "available" : "partial")
      : "unavailable",
    drawingDetectionAvailable: hasReal,
    detections,
    note: hasReal
      ? undefined
      : "Vizuálne spočítanie značiek z výkresu zatiaľ nebolo potvrdené — množstvá pochádzajú z legendy/výkazu.",
  };
}

/**
 * When a switch/socket symbol is found, the company typically needs:
 * - the device itself (from document),
 * - installation box,
 * - cable run (meters unknown → needsReview),
 * - labor to chase/pull/mount/connect.
 * Cable length is NEVER invented as exact — marked for review / site measure.
 */
function expandPointCompanions(
  occurrences: SymbolOccurrencePayload[],
  existingInferred: ExtractedItemPayload[],
  documentItems: ExtractedItemPayload[] = []
): ExtractedItemPayload[] {
  const out: ExtractedItemPayload[] = [];
  const hasCableAlready =
    existingInferred.some(
      (i) => i.category === "cable" || /kábel|kabel|cyky|nym|cable/i.test(i.title)
    ) ||
    documentItems.some(
      (i) => i.category === "cable" || /kábel|kabel|cyky|nym|cable/i.test(i.title)
    );

  let switchPts = 0;
  let socketPts = 0;
  for (const s of occurrences) {
    const qty =
      typeof s.quantity === "number" && Number.isFinite(s.quantity) && s.quantity > 0
        ? s.quantity
        : 0;
    if (s.normalizedType === "switch") switchPts += qty || 0;
    if (s.normalizedType === "socket") socketPts += qty || 0;
  }
  // Fall back to document takeoff quantities when occurrences missed points.
  if (switchPts <= 0 || socketPts <= 0) {
    for (const i of documentItems) {
      const qty =
        typeof i.computedQuantity === "number" && i.computedQuantity > 0
          ? i.computedQuantity
          : typeof i.quantity === "number" && i.quantity > 0
            ? i.quantity
            : 0;
      if (qty <= 0) continue;
      if (switchPts <= 0 && i.category === "switch") switchPts += qty;
      if (socketPts <= 0 && i.category === "socket") socketPts += qty;
    }
  }

  const pointTotal = switchPts + socketPts;
  if (pointTotal <= 0) return out;

  if (switchPts > 0) {
    out.push({
      id: `inf_box_switch_${switchPts}`,
      category: "installation_material",
      title: "Inštalačná krabica pre vypínač",
      description: "Krabica / podomietková krabica podľa typu vypínača — overiť na stavbe.",
      quantity: switchPts,
      unit: "ks",
      origin: "inferred",
      evidence: [],
      confidence: "medium",
      needsReview: true,
      reviewReason: "Počet podľa značiek vypínačov; typ krabice overiť.",
    });
    out.push({
      id: `inf_labor_switch_${switchPts}`,
      category: "labor",
      title: "Montáž a zapojenie vypínača",
      description: "Osadenie, zapojenie a skúška vypínača.",
      quantity: switchPts,
      unit: "ks",
      origin: "inferred",
      evidence: [],
      confidence: "medium",
      needsReview: false,
    });
  }

  if (socketPts > 0) {
    out.push({
      id: `inf_box_socket_${socketPts}`,
      category: "installation_material",
      title: "Inštalačná krabica pre zásuvku",
      description: "Krabica podľa typu zásuvky — overiť na stavbe.",
      quantity: socketPts,
      unit: "ks",
      origin: "inferred",
      evidence: [],
      confidence: "medium",
      needsReview: true,
      reviewReason: "Počet podľa značiek zásuviek; typ krabice overiť.",
    });
    out.push({
      id: `inf_labor_socket_${socketPts}`,
      category: "labor",
      title: "Montáž a zapojenie zásuvky",
      description: "Osadenie, zapojenie a skúška zásuvky.",
      quantity: socketPts,
      unit: "ks",
      origin: "inferred",
      evidence: [],
      confidence: "medium",
      needsReview: false,
    });
  }

  if (!hasCableAlready) {
    out.push({
      id: `inf_cable_types_${pointTotal}`,
      category: "cable",
      title: "Kabeláž (typ a dĺžka — doplniť)",
      description:
        `Na pláne je ${pointTotal} bodov (zásuvky/vypínače). Typ kábla (napr. CYKY 3×1,5 / 3×2,5) a metre trás ` +
        "uveďte z legendy / kót / obhliadky — zo značiek samotných sa dĺžka spoľahlivo nevypočíta.",
      unit: "m",
      origin: "assumption",
      evidence: [],
      confidence: "low",
      needsReview: true,
      reviewReason: "Chýba typ a dĺžka kábla z výkresu — doplňte pred pevnou cenou.",
    });
  }

  return out;
}

/** Standard install packages an estimator expects on a full electrical job. */
function expandElectricalInstallScope(
  documentItems: ExtractedItemPayload[],
  existingInferred: ExtractedItemPayload[]
): ExtractedItemPayload[] {
  const isElectrical =
    documentItems.some((i) =>
      ["socket", "switch", "lighting", "led_strip", "distribution_board", "cable"].includes(
        i.category
      )
    ) ||
    existingInferred.some((i) =>
      ["socket", "switch", "lighting", "led_strip", "distribution_board", "cable"].includes(
        i.category
      )
    );
  if (!isElectrical) return [];

  const existingTitles = new Set(
    [...documentItems, ...existingInferred].map((i) => i.title.trim().toLowerCase())
  );

  const packages: Array<Omit<ExtractedItemPayload, "id" | "evidence">> = [
    {
      category: "labor",
      title: "Drážkovanie a príprava trás",
      description: "Drážky v murive/SDK podľa trás — rozsah overiť na stavbe.",
      unit: "m",
      origin: "inferred",
      confidence: "low",
      needsReview: true,
      reviewReason: "Rozsah drážok nie je spoľahlivo odvoditeľný zo značiek — doplňte metre.",
    },
    {
      category: "labor",
      title: "Osadenie a zapojenie rozvádzača",
      description: "Montáž rozvádzača / rozvodnice, ističe, popis — podľa projektu.",
      quantity: 1,
      unit: "ks",
      origin: "inferred",
      confidence: "medium",
      needsReview: true,
      reviewReason: "Overiť počet a typ rozvádzačov na výkrese.",
    },
    {
      category: "labor",
      title: "Zatiahnutie a ukončenie kabeláže",
      description: "Ťahanie káblov, ukončenie vo vývodoch a v rozvádzači.",
      unit: "pausal",
      origin: "inferred",
      confidence: "low",
      needsReview: true,
      reviewReason: "Závisí od dĺžok trás a počtu obvodov.",
    },
    {
      category: "labor",
      title: "Skúšky, merania a odovzdanie",
      description: "Funkčné skúšky, merania, dokumentácia / odovzdanie.",
      quantity: 1,
      unit: "pausal",
      origin: "inferred",
      confidence: "medium",
      needsReview: false,
    },
  ];

  return packages
    .filter((p) => !existingTitles.has(p.title.trim().toLowerCase()))
    .map((p, idx) => ({
      ...p,
      id: `inf_scope_${idx}_${p.title.slice(0, 12)}`,
      evidence: [],
    }));
}

function mergeRoomsFromItems(
  rooms: EstimatorFactsPayload["rooms"],
  items: ExtractedItemPayload[]
): EstimatorFactsPayload["rooms"] {
  const byName = new Map<string, EstimatorFactsPayload["rooms"][number]>();
  for (const r of rooms) {
    const key = r.name.trim().toLowerCase();
    if (!key) continue;
    byName.set(key, r);
  }
  for (const i of items) {
    const name = i.roomName?.trim();
    if (!name) continue;
    const key = name.toLowerCase();
    if (byName.has(key)) continue;
    byName.set(key, {
      id: `room_${key.replace(/\s+/g, "_").slice(0, 40)}`,
      name,
      evidence: i.evidence ?? [],
      confidence: "medium",
      needsReview: false,
    });
  }
  return [...byName.values()];
}

function ensureElectricalPointQuestions(
  facts: EstimatorFactsPayload,
  occurrences: SymbolOccurrencePayload[]
): EstimatorFactsPayload["missingQuestions"] {
  const qs = [...facts.missingQuestions];
  const has = (re: RegExp) => qs.some((q) => re.test(q.question));
  const pointTypes = occurrences.filter((s) =>
    s.normalizedType === "switch" || s.normalizedType === "socket"
  );
  if (pointTypes.length === 0) return qs;

  const add = (
    id: string,
    question: string,
    reason: string,
    importance: "critical" | "important" | "nice_to_have",
    blocksFixedQuote: boolean
  ) => {
    if (qs.some((q) => q.id === id || q.question === question)) return;
    qs.push({ id, question, reason, importance, blocksFixedQuote });
  };

  if (!has(/kábel|kabel|trasa|dĺžk/i)) {
    add(
      "q_cable_lengths",
      "Aké sú reálne dĺžky káblových trás (alebo máme ísť na obhliadku a zmerať)?",
      "Značky vo výkrese ukazujú body, nie spoľahlivú dĺžku kábla.",
      "critical",
      true
    );
  }
  if (!has(/sekan|drážkov|chas/i)) {
    add(
      "q_chasing",
      "Je v cene zahrnuté sekanie / drážkovanie, alebo je káblovanie už pripravené?",
      "Bez toho nejde dať fixnú cenu za hrubú elektroinštaláciu.",
      "critical",
      true
    );
  }
  if (!has(/dodáv|svietidl|zásuv|vypínač.*zákazník|zákazník.*zásuv/i)) {
    add(
      "q_supply_devices",
      "Dodáva vypínače, zásuvky a svietidlá zákazník, alebo firma?",
      "Ovplyvní materiál, záruku a cenu.",
      "important",
      true
    );
  }
  return qs;
}

function buildCompanyFocusFallback(
  facts: EstimatorFactsPayload,
  occurrences: SymbolOccurrencePayload[],
  unknowns: SymbolOccurrencePayload[]
): EstimatorFactsPayload["companyFocus"] {
  const focus: EstimatorFactsPayload["companyFocus"] = [];
  let n = 0;
  const add = (item: EstimatorFactsPayload["companyFocus"][number]) => focus.push(item);

  for (const s of occurrences.slice(0, 60)) {
    add({
      id: `focus_q_${n++}`,
      title: s.roomName ? `${s.title} — ${s.roomName}` : s.title,
      description: s.needsReview
        ? s.reviewReason || "Overiť množstvo pred fixnou cenou."
        : "Zahrnúť do cenovej ponuky.",
      focusType: s.needsReview ? "site_verification" : "quote_line",
      importance: s.needsReview ? "important" : "nice_to_have",
      relatedRoomId: s.roomId,
      relatedSymbolIds: [s.id],
    });
  }
  for (const q of facts.missingQuestions.slice(0, 20)) {
    add({
      id: `focus_ask_${n++}`,
      title: q.question,
      description: q.reason || "",
      focusType: "customer_question",
      importance: q.importance,
    });
  }
  for (const r of facts.risks.slice(0, 20)) {
    add({
      id: `focus_risk_${n++}`,
      title: r.title,
      description: r.description,
      focusType: "risk",
      importance: r.severity === "high" ? "critical" : "important",
    });
  }
  for (const u of unknowns.slice(0, 20)) {
    add({
      id: `focus_unknown_${n++}`,
      title: u.visibleLabel || u.title,
      description: u.reviewReason || "Neznáma značka — potrebné manuálne overenie.",
      focusType: "site_verification",
      importance: "important",
      relatedSymbolIds: [u.id],
    });
  }
  return focus;
}

const GENERIC_TITLES = new Set([
  "light",
  "lights",
  "cable",
  "electrical material",
  "installation material",
  "material",
  "svetlo",
  "kábel",
  "kabel",
  "elektroinštalačný materiál",
  "montážny materiál",
]);

export type EstimatorValidationResult = {
  warnings: string[];
  /** Quote should be presented as indicative rather than fixed. */
  indicative: boolean;
};

/**
 * Phase 9 — validate AI output and flag common failure modes.
 * Additive: returns warnings + an `indicative` flag; never throws.
 */
export function validateEstimatorFacts(
  facts: EstimatorFactsPayload,
  opts: { visionUsed: boolean; textOnlyUsed: boolean } = { visionUsed: true, textOnlyUsed: false }
): EstimatorValidationResult {
  const warnings: string[] = [];
  const items = [...facts.extractedItems, ...facts.inferredItems];
  const docItems = facts.extractedItems;
  const looksTechnical =
    facts.detectedDocumentTypes.includes("electrical_marking") ||
    facts.detectedDocumentTypes.includes("floor_plan") ||
    facts.detectedDocumentTypes.includes("technical_specification");

  // 1. Only generic items, no detailed extracted rows.
  const nonGeneric = docItems.filter((i) => !GENERIC_TITLES.has(i.title.trim().toLowerCase()));
  if (docItems.length > 0 && nonGeneric.length === 0) {
    warnings.push(
      "AI vrátila len všeobecné položky (svetlo/kábel/materiál) bez detailných riadkov z dokumentu — skontrolujte podklad."
    );
  }

  // 2. Technical drawing but no legend entries.
  if (looksTechnical && (facts.legendEntries?.length ?? 0) === 0) {
    warnings.push(
      "Dokument vyzerá ako technický výkres, ale nenašla sa legenda značiek — značky nemusia byť správne priradené."
    );
  }

  // 3. Rooms visible but nothing assigned to a room.
  const anyRoomAssigned =
    items.some((i) => i.roomName?.trim()) ||
    (facts.symbolOccurrences ?? []).some((s) => s.roomName?.trim());
  if (facts.rooms.length > 0 && !anyRoomAssigned) {
    warnings.push(
      "Vo výkrese sú miestnosti, ale žiadna položka/značka k nim nebola priradená — skontrolujte priradenie k miestnostiam."
    );
  }

  // 4. LED strip present but no length/quantity and not flagged for review.
  const ledNoQty = items.some(
    (i) =>
      (i.category === "led_strip" || /led/i.test(i.title)) &&
      i.quantity == null &&
      i.computedQuantity == null &&
      !i.needsReview
  );
  if (ledNoQty) {
    warnings.push(
      "LED pás bez dĺžky/množstva a bez označenia na kontrolu — doplňte dĺžku alebo označte na overenie."
    );
  }

  // 5. Many high-confidence items but no source page.
  const highConf = docItems.filter((i) => i.confidence === "high");
  const highConfNoPage = highConf.filter((i) => i.evidence?.[0]?.page == null);
  if (highConf.length >= 5 && highConfNoPage.length / highConf.length > 0.7) {
    warnings.push(
      "Veľa položiek s vysokou istotou nemá zdrojovú stranu — overte, či pochádzajú z dokumentu."
    );
  }

  // 7. Indicative quote conditions.
  const missingQtyCount = docItems.filter(
    (i) => i.quantity == null && i.computedQuantity == null
  ).length;
  const indicative =
    facts.confidence === "low" ||
    (docItems.length > 0 && missingQtyCount / docItems.length > 0.4) ||
    (opts.textOnlyUsed && !opts.visionUsed) ||
    facts.detectedDocumentTypes.includes("site_photo") ||
    facts.detectedDocumentTypes.includes("customer_description") ||
    ((facts.legendEntries?.length ?? 0) === 0 && looksTechnical);

  return { warnings, indicative };
}
