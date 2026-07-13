import { NUMBER_FORMAT_RULES } from "../attachmentSummarySchema";

export function buildElectricalMarkingPrompt(params: {
  language: string;
  fileName: string;
  countryCode: string;
  currency: string;
  tradeType: string;
}): string {
  return `You are an experienced European electrical estimator for Staveto (${params.countryCode}, ${params.currency}).
Analyze this electrical marking / lighting plan: "${params.fileName}".
Trade context: ${params.tradeType}.
Human-readable strings language: ${params.language}.

CRITICAL RULES:
- FIRST read the drawing's legend / symbol key / legenda / vysvetlivky / značky table. For every symbol or mark, record its meaning (title) and count how many times it appears (per room if possible).
- Read ALL text labels, callouts, dimension notes and annotations drawn on the plan, not only the legend.
- Map each symbol on the plan to its legend meaning; do not output raw symbol codes without their meaning.
- inputSummary MUST be plain text, max ~400 characters (never a nested object).
- Extract every visible room, area, legend row, lighting row, LED strip row and quantity.
- Do NOT summarize repeated rows into categories.
- Do NOT merge separate rows too early (different rooms / lengths / multipliers stay separate).
- Do NOT invent missing quantities.
- If quantity is missing, keep the item and mark needsReview=true with reviewReason.
- Use comma decimal formats correctly (e.g. 12,5 m).
- Parse units: ks, m, m2, bod, set, pausal, hod.
- Parse multipliers such as "4 x LED pás v SDK" → multiplier + quantity → computedQuantity.
- Store visible quantity and computedQuantity separately.
- Prefer specific Slovak/local titles as written on the drawing (e.g. "LED pás v SDK", "Visiace svietidlo"), never generic English "light" / "cable" / "LED strip".
- Group by room when the drawing shows rooms.
- Every item must include evidence (fileName, page if known), origin=from_document, confidence, needsReview.
- Return JSON only.

Look for rooms such as: VSTUP, TOALETA, OBYVACIA IZBA, KUCHYNA, PRACOVNA, SPALNA, SATNIK, KUPELNA I/II, HOSTOVSKA IZBA, …
Look for item types such as: Visiace svietidlo, Stropné svietidlo, Nástenné osvetlenie, LED pás v svetelnej lište, LED pás v SDK, Svietidlá v lište, Vývod pre podsvietenie zrkadla, Podsvietenie nábytku, switches, sockets, distribution board notes.

Separate:
1) extractedItems = facts visible in the document (origin from_document)
2) inferredItems = professional experience only (origin inferred/assumption), never pretend they are visible
3) missingQuestions = what must be confirmed before a fixed quote (mark blocksFixedQuote for critical)
4) risks = technical/commercial risks

${NUMBER_FORMAT_RULES}

Return JSON:
{
  "detectedDocumentTypes": ["electrical_marking"],
  "inputSummary": string,
  "rooms": [{ "id": string, "name": string, "code"?: string, "areaM2"?: number, "floor"?: string, "evidence": [{ "fileName": string, "page"?: number, "inputType": "pdf" }], "confidence": "high"|"medium"|"low", "needsReview": boolean }],
  "extractedItems": [{ "id": string, "category": "lighting"|"socket"|"switch"|"cable"|"led_strip"|"distribution_board"|"installation_material"|"labor"|"travel"|"other", "roomId"?: string, "roomName"?: string, "title": string, "description"?: string, "quantity"?: number, "unit"?: "ks"|"m"|"m2"|"hod"|"bod"|"set"|"pausal"|"unknown", "multiplier"?: number, "computedQuantity"?: number, "origin": "from_document", "evidence": [{ "fileName": string, "page"?: number, "inputType": "pdf" }], "confidence": "high"|"medium"|"low", "needsReview": boolean, "reviewReason"?: string }],
  "inferredItems": [same shape with origin "inferred"|"assumption"],
  "missingQuestions": [{ "id": string, "question": string, "reason": string, "importance": "critical"|"important"|"nice_to_have", "blocksFixedQuote": boolean, "suggestedAnswer"?: string }],
  "risks": [{ "id": string, "title": string, "description": string, "severity": "high"|"medium"|"low", "commercialImpact"?: string }],
  "confidence": "high"|"medium"|"low",
  "warnings": string[]
}

Prefer many specific rows (up to 120 extracted items) over few generic categories.
Never collapse different LED strip rows into one generic "LED strip" unless the document itself does.`;
}

export function buildElectricalSymbolReadingPrompt(params: {
  language: string;
  fileName: string;
  countryCode: string;
  currency: string;
  tradeType: string;
}): string {
  return `You are an experienced European electrical estimator and construction project analyst for Staveto (${params.countryCode}, ${params.currency}).
Analyze this technical electrical drawing page: "${params.fileName}".
Trade context: ${params.tradeType}. Human-readable strings language: ${params.language}.

Your job is NOT to write a summary. Extract structured drawing facts for quoting and execution.

PROCESS (legend-first, do not count random shapes first):
1. Identify which drawing regions the page contains: legend, lighting_plan, socket/switch plan, room list, material table, title_block, floor_plan.
2. If a legend / key / legenda / vysvetlivky / značky is visible, extract EVERY legend row into legendEntries:
   - symbolLabel (the mark/code if visible), symbolDescription (meaning), unit, quantity if written, notes.
   - normalizedType (see enum below); if you cannot map safely, use "unknown" and needsReview=true.
2b. NUMBERED MARKS: many SK/CZ installation plans print small INDEX NUMBERS (1, 2, 13, 14, 18, 20 …) directly next to each symbol on the plan. These numbers reference a numbered legend / výkaz row. They are DRAWING CODES, never quantities.
   - Capture the number as symbolLabel on the legend row and as visibleLabel on every occurrence.
   - The same number repeated at several positions = several occurrences of the SAME mark. Count the positions.
   - Color coding is common (e.g. red = sockets/power, green = light outputs/switches, blue/cyan = dimensions or LED). Use color as a hint, and the legend as truth.
2c. TEXT CALLOUTS: symbols are often labelled by short text next to them ("Zásuvky v nábytku", "Vývod zo zeme", "Podsvietenie vitrína v-1850mm", "LED pás 13"). Read EVERY such callout; the text is the meaning, a trailing number is the mark code, "v-XXXXmm" is mounting height (put into description, never into quantity).
3. Build a symbol dictionary from the legend (THIS drawing wins over any general knowledge).
4. Search the FULL plan (not only the legend) for those symbols and record symbolOccurrences.
   - Prefer ONE aggregated row per symbol type per room with quantity = counted pieces.
   - Example: 12 identical ceiling lights in "Kuchyňa" → one occurrence with quantity 12 (not 12 rows of 1).
   - Always fill visibleLabel with the mark number/code seen on the plan when present.
   - Honest counting source: when YOU visually counted the marks on the plan, set quantity, detectedOccurrenceCount = counted number and quantitySource="drawing_detection". When the number was read from a printed table/výkaz/legend quantity column, set quantitySource="schedule" and leave detectedOccurrenceCount null. Never fake a visual count.
5. Connect each occurrence to a room when room names are visible (roomName). Fill rooms[] with every labeled room + areaM2 if written.
6. Count occurrences only when reasonably visible. Never invent exact quantities.
   - If you cannot count a mark type, omit quantity and set needsReview=true (do NOT put the legend code in parentheses as if it were a count).
7. Linear items (LED strips/profiles / labelled cable routes): use visible length if written; otherwise quantity omitted + needsReview=true + reviewReason.
8. Never collapse separate rows into generic categories (different rooms/lengths/multipliers stay separate).
9. Keep any sign you cannot identify safely in unknownSymbols with normalizedType="unknown", needsReview=true and a reviewReason.
10. Also fill the estimator rows: rooms, extractedItems (origin from_document; include computedQuantity when counted), inferredItems (professional scope only, origin inferred/assumption).
11. Fill companyFocus: what the company must DO with each fact (quote_line, material_purchase, labor_planning, site_verification, customer_question, risk, execution_task).

CRITICAL: symbolLabel in the legend (e.g. "29", "V1") is a DRAWING CODE, not a piece count. Put counts only in quantity / computedQuantity fields.
CRITICAL: every extractedItem that corresponds to a numbered/coded mark MUST carry that code in symbolCode (same value as the occurrence visibleLabel / legend symbolLabel). Do not leave symbolCode empty when the mark has a visible number or code.

CRITICAL — COMPLETE TAKEOFF (do not stop at lighting):
Slovak / Czech marking-plan terms you MUST hunt for on BOTH legend and plan:
- Zásuvky: zásuvka, 2zásuvka, dvojpólová zásuvka, El.zásuvka, datová zásuvka, Schuko, "zásuvky v nábytku", "zásuvky z prac.dosky", "El.3zásuvky vedľa seba", "zásuvka pod sebou" → normalizedType=socket
- Podlahové / zemné vývody: "vývod zo zeme", "podlahová zásuvka", "zemná krabica" → socket (note floor outlet in title/description)
- Vypínače: vypínač, prepínač, schodišťový, stmievač, tlačidlo → normalizedType=switch
- Osvetlenie: visiace/stropné/nástenné svietidlo, LED pás, lišta, "zapustené osvetlenie", "lištový systém", podsvietenie → lighting / led_strip / lighting_profile
- Nábytkové podsvietenie: "podsvietenie skriniek", "podsvietenie vitrína", "podsvietenie príborník", "podsvietenie nábytku" → furniture_light
- Spotrebičové vývody: "vývod pre varnú dosku", "myčka", "chladnička", "mikrovlnka", "El.rúra", "digestor", "indukčná doska", "5 žilový kábel", "380-415V" → socket or other, keep the appliance name in the title, mark needsReview when circuit spec matters
- Rozvádzač / rozvodnica / RH / RE → distribution_board
- Káble / trasy: CYKY, NYM, kábel, trasa, vodič — put TYPE in title when written (e.g. "CYKY 3×2,5"); length only if dimensioned on plan → cable_route
- Mounting heights "v-350mm", "v-560mm", "v-1850mm" belong in description, NEVER in quantity.
If the legend lists sockets/switches, they MUST appear in legendEntries AND you must attempt counts in symbolOccurrences (or needsReview without inventing counts).
A lighting-only takeoff when the legend also shows zásuvky/vypínače is a FAILURE — add those rows.

Cable lengths: NEVER invent meters from socket/switch counts. Only use lengths written on the drawing or leave quantity empty + needsReview.

normalizedType enum: pendant_light, ceiling_light, wall_light, led_strip, lighting_profile, mirror_light_output, furniture_light, socket, switch, distribution_board, cable_route, unknown.

Focus for electrical drawings: switches, sockets, pendant/ceiling/wall lights, LED strips, lighting profiles, mirror/furniture lighting, cable types/routes, distribution board, room labels, room areas, quantities, multipliers ("4 x ..."), notes affecting price/execution.

Company focus rules:
- Quote-relevant quantities: socket points, switch points, light points, LED lengths, cable types (when labelled), distribution board, chasing/cutting (drážky), commissioning/testing.
- Missing questions: fixtures by customer or contractor? LED strips included or only prep? profiles/PSU included? chasing included? cabling already in? board prepared? revision included? brand/standard? fixed vs indicative? site visit?
- Risks: lighting-only layer; incomplete counts; cable lengths not from symbols alone; PSU/controls unclear; wall/ceiling condition unknown; customer-supplied fixtures.

Every legend entry, symbol, extracted item MUST include: room if known, title, quantity if visible, unit, origin, confidence, evidence (fileName + page if known), needsReview, reviewReason if uncertain. Do not pretend 100% precision.
inputSummary MUST be plain text (max ~400 characters), never a nested object.

Symbol-key grounding (architectural installation plans):
- Prefer the drawing's own legend as the single source of truth for this project.
- Typical EU/SK marking plans follow IEC 60617 / former STN EN 60617 architectural installation symbols. Exact glyphs vary — always map via THIS drawing's legend.
- Related practice: STN 33 2000 (LV installations), STN 33 0010 (marking/abbreviations).

${NUMBER_FORMAT_RULES}

Return JSON only:
{
  "detectedDocumentTypes": ["electrical_marking"],
  "inputSummary": string,
  "drawingRegions": [{ "id": string, "page": number, "label"?: string, "regionType": "legend"|"floor_plan"|"room"|"title_block"|"table"|"unknown", "confidence": "high"|"medium"|"low" }],
  "legendEntries": [{ "id": string, "trade": "electrical", "symbolLabel"?: string, "symbolDescription": string, "normalizedType": string, "unit"?: "ks"|"m"|"m2"|"bod"|"set"|"unknown", "defaultQuoteCategory": "material"|"labor"|"material_and_labor"|"review_only", "evidence": [{ "fileName": string, "page"?: number, "inputType": "pdf" }], "confidence": "high"|"medium"|"low", "needsReview": boolean }],
  "symbolOccurrences": [{ "id": string, "legendEntryId"?: string, "page": number, "roomName"?: string, "normalizedType": string, "title": string, "quantity"?: number, "unit"?: "ks"|"m"|"m2"|"bod"|"set"|"unknown", "visibleLabel"?: string, "quantitySource"?: "drawing_detection"|"schedule"|"legend"|"unknown", "detectedOccurrenceCount"?: number|null, "origin": "from_document", "evidence": [{ "fileName": string, "page"?: number, "inputType": "pdf" }], "confidence": "high"|"medium"|"low", "needsReview": boolean, "reviewReason"?: string }],
  "unknownSymbols": [same shape as symbolOccurrences with normalizedType "unknown"],
  "rooms": [{ "id": string, "name": string, "areaM2"?: number, "evidence": [{ "fileName": string, "page"?: number, "inputType": "pdf" }], "confidence": "high"|"medium"|"low", "needsReview": boolean }],
  "extractedItems": [{ "id": string, "category": "lighting"|"socket"|"switch"|"cable"|"led_strip"|"distribution_board"|"installation_material"|"labor"|"travel"|"other", "roomName"?: string, "title": string, "symbolCode"?: string, "quantity"?: number, "unit"?: string, "multiplier"?: number, "computedQuantity"?: number, "quantitySource"?: "drawing_detection"|"schedule"|"legend"|"unknown", "detectedOccurrenceCount"?: number|null, "origin": "from_document", "evidence": [{ "fileName": string, "page"?: number, "inputType": "pdf" }], "confidence": "high"|"medium"|"low", "needsReview": boolean, "reviewReason"?: string }],
  "inferredItems": [same shape with origin "inferred"|"assumption"],
  "companyFocus": [{ "id": string, "title": string, "description": string, "focusType": "quote_line"|"material_purchase"|"labor_planning"|"site_verification"|"customer_question"|"risk"|"execution_task", "importance": "critical"|"important"|"nice_to_have", "relatedRoomId"?: string }],
  "missingQuestions": [{ "id": string, "question": string, "reason": string, "importance": "critical"|"important"|"nice_to_have", "blocksFixedQuote": boolean }],
  "risks": [{ "id": string, "title": string, "description": string, "severity": "high"|"medium"|"low", "commercialImpact"?: string }],
  "confidence": "high"|"medium"|"low",
  "warnings": string[]
}

Prefer many specific rows (up to 120) over few generic categories.
Never collapse different LED strip rows into one generic "LED strip" unless the document itself does.`;
}

export function buildPhotoEstimatorPrompt(params: {
  language: string;
  fileName: string;
  countryCode: string;
}): string {
  return `You are a European construction estimator analyzing a site/photo: "${params.fileName}".
Language: ${params.language}. Country: ${params.countryCode}.
Extract only visible elements. Mark assumptions clearly.
If measurements are missing, add missingQuestions and recommend site visit if needed.
Return the same JSON schema as electrical estimator (rooms optional, extractedItems from_photo, inferredItems assumption/inferred).
Do not invent exact quantities. Prefer needsReview=true when unsure.
Max ~80 extracted/inferred items combined.`;
}

export function buildTextOnlyEstimatorPrompt(params: {
  language: string;
  countryCode: string;
  currency: string;
  tradeType: string;
  description: string;
  location?: string;
}): string {
  return `You are a European construction estimator (Staveto).
Country ${params.countryCode}, currency ${params.currency}, language ${params.language}.
Trade: ${params.tradeType}.
Customer description:
${params.description}
Location: ${params.location ?? "not specified"}

No documents were uploaded. Create structured facts from text only.
- extractedItems may be empty or from_user_text when explicitly named
- inferredItems for professional scope guesses (origin inferred/assumption)
- Ask critical missing questions (counts, lengths, who supplies materials, chasing/cutting, existing condition, access, deadline)
- Mark confidence low/medium
- risks must mention assumption-based pricing

inputSummary MUST be plain text (max ~400 characters), never a nested object.

Return the estimator facts JSON schema (rooms, extractedItems, inferredItems, missingQuestions, risks, confidence, warnings, inputSummary, detectedDocumentTypes: ["customer_description"]).`;
}

export function buildGenericDocumentEstimatorPrompt(params: {
  language: string;
  fileName: string;
  countryCode: string;
  currency: string;
}): string {
  return `You are a European construction estimator analyzing "${params.fileName}".
Language: ${params.language}. Country: ${params.countryCode}. Currency: ${params.currency}.
Extract structured rooms, legend/table rows, materials, quantities, risks and missing questions.
Do not over-summarize. Preserve row-level detail with evidence fileName/page.
Read any legend / key / table and map symbols to their meaning with counts.
detectedDocumentTypes may include floor_plan, material_list, technical_specification, quote_request, or unknown.
inputSummary MUST be plain text (max ~400 characters), never a nested object.
Return estimator facts JSON. Up to 100 extracted items.

${NUMBER_FORMAT_RULES}`;
}

export function buildEstimateFromFactsPrompt(params: {
  language: string;
  countryCode: string;
  currency: string;
  vatPercent: number;
  hourlyRate?: number;
  travelRate?: number;
  marginPercent?: number;
  factsJson: string;
}): string {
  return `You are Staveto AI Kalkulant.
Build commercial estimate lines from estimator facts.
Language: ${params.language}. Country: ${params.countryCode}. Currency: ${params.currency}. VAT: ${params.vatPercent}%.
Default hourly rate: ${params.hourlyRate ?? "unknown"}. Travel rate: ${params.travelRate ?? "unknown"}. Material margin %: ${params.marginPercent ?? 20}.

Rules:
- Do not invent precision. If quantity unknown, use needsReview and omit unitPrice or set low confidence.
- Prefer one line per extracted item (do not merge LED strips across rooms).
- Add labor lines where installation is implied.
- Add travel only if address/distance known or as assumption with needsReview.
- Keep origin/confidence/evidence from facts.

Facts JSON:
${params.factsJson.slice(0, 120000)}

Return JSON:
{
  "lines": [{ "id": string, "type": "material"|"labor"|"travel"|"subcontractor"|"other", "title": string, "description"?: string, "quantity": number, "unit": string, "unitCost"?: number, "unitPrice"?: number, "marginPercent"?: number, "totalCost"?: number, "totalPrice"?: number, "origin": string, "confidence": string, "needsReview": boolean, "evidence": [], "roomName"?: string }],
  "warnings": string[]
}`;
}

export function buildQuoteDraftFromEstimatePrompt(params: {
  language: string;
  countryCode: string;
  currency: string;
  vatPercent: number;
  legalNotes: string[];
  title: string;
  customerName?: string;
  projectAddress?: string;
  factsJson: string;
  linesJson: string;
}): string {
  return `You are Staveto AI Angebotsagent.
Create a professional quote draft for ${params.countryCode} in language ${params.language}.
Currency ${params.currency}, VAT ${params.vatPercent}%.
Legal notes: ${params.legalNotes.join(" | ") || "none"}.
Title hint: ${params.title}
Customer: ${params.customerName ?? "—"}
Address: ${params.projectAddress ?? "—"}

Facts:
${params.factsJson.slice(0, 60000)}

Estimate lines:
${params.linesJson.slice(0, 60000)}

If confidence is low/medium OR input was photo/text-only OR critical missing questions remain:
- Mark noteToCustomer clearly as "Orientačná / predbežná cenová ponuka"
- List assumptions and exclusions
- Do not present totals as a fixed price

If the PDF/table facts are sufficiently clear:
- Still list assumptions
- Note that unclear rows (needsReview) must be confirmed before fixed price

Return JSON quote draft:
{
  "title": string,
  "customerName"?: string,
  "projectAddress"?: string,
  "countryCode": "${params.countryCode}",
  "currency": "${params.currency}",
  "vatPercent": ${params.vatPercent},
  "language": "${params.language}",
  "scopeIncluded": string[],
  "scopeExcluded": string[],
  "assumptions": string[],
  "missingBeforeFixedPrice": [{ "id": string, "question": string, "reason": string, "importance": "critical"|"important"|"nice_to_have", "blocksFixedQuote": boolean }],
  "lines": [estimate lines with prices if known],
  "subtotal"?: number,
  "vatAmount"?: number,
  "total"?: number,
  "validityDays": 14,
  "noteToCustomer": string
}`;
}
