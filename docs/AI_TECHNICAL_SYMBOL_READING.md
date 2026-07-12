# AI Technical Symbol Reading (Staveto AI Kalkulant)

Legend-first technical symbol reading for construction drawings, starting with
electrical drawings. This is an **additive** layer on top of the existing AI
estimator flow. It is **human-in-the-loop**, not an autonomous CAD parser.

## Feature flags

- `NEXT_PUBLIC_ENABLE_AI_ESTIMATOR_FLOW=1` — enables the whole estimator flow.
- `NEXT_PUBLIC_AI_ESTIMATOR_DEBUG=1` — client/server debug logs.
- `NEXT_PUBLIC_ENABLE_AI_SYMBOL_READING` — symbol reading. Default **ON** when the
  estimator flow is on; set to `0` to disable and fall back to the plain
  electrical extraction prompt.

The client sends `enableSymbolReading` to the `generateEstimatorFacts` callable.
When `false`, the server uses `buildElectricalMarkingPrompt` (no symbol layer).

## Pipeline

```
drawing page (PDF/image)
  → pdf split per page (pdf-lib)              functions/src/estimator/pdfPageSplit.ts
  → Gemini vision, legend-first prompt        functions/src/estimator/estimatorPrompts.ts
                                              (buildElectricalSymbolReadingPrompt)
  → robust JSON parse (+ truncation repair)   functions/src/estimator/estimatorSchema.ts
                                              (parseLooseJsonObject, parseEstimatorFactsJson)
  → evidence/page stamping                    functions/src/estimator/estimatorGemini.ts
  → strict merge across pages/files           functions/src/estimator/estimatorMerge.ts
  → convert drawing facts → company outputs   functions/src/estimator/symbolReading.ts
                                              (convertTechnicalDrawingFactsToEstimatorItems)
  → validation + indicative flag              functions/src/estimator/symbolReading.ts
                                              (validateEstimatorFacts)
  → estimator facts (stored in session)       workspaces/{ws}/aiEstimatorSessions/{id}
  → estimate lines → quote draft → project    functions/src/estimator/estimatorHandlers.ts
```

The Gemini prompt is **legend-first**: it reads the legend/key table first,
builds a symbol dictionary, then searches the plan for those symbols. The same
symbol can mean different things in different projects, so we never count shapes
before reading the legend.

## Data model (additive)

Client types in `src/types/aiEstimator.ts`, server Zod schemas in
`functions/src/estimator/estimatorSchema.ts`:

- `AiDrawingRegion` — legend / floor_plan / room / table / title_block regions.
- `AiLegendEntry` — one legend row: symbol label, meaning, `normalizedType`,
  unit, default quote category, evidence, confidence, needsReview.
- `AiSymbolOccurrence` — a symbol found on the plan, linked to a room, with
  quantity/unit when visible, origin, evidence (file + page), confidence,
  needsReview + reviewReason.
- `AiCompanyFocusItem` — what the company must DO with a fact: `quote_line`,
  `material_purchase`, `labor_planning`, `site_verification`,
  `customer_question`, `risk`, `execution_task`.

These are added to `AiEstimatorFacts` as **optional** arrays:
`drawingRegions`, `legendEntries`, `symbolOccurrences`, `unknownSymbols`,
`companyFocus`. Existing consumers are unaffected.

## Conversion rules (`convertTechnicalDrawingFactsToEstimatorItems`)

- Document facts have priority over inferred items.
- Symbol occurrences are folded into `extractedItems` (deduped by
  room+title+qty+unit) so quote/project generation uses symbol-derived facts.
- Occurrences typed `unknown` are moved into `unknownSymbols` and are **never**
  folded into quotable items — they are surfaced for human review.
- `companyFocus` is built as a fallback only when the model did not provide it.

## Validation (`validateEstimatorFacts`, Phase 9)

Warnings are appended to `facts.warnings`; an `indicative` flag is stored in
diagnostics. Rules:

1. Only generic items (light/cable/material) and no detailed rows → warn.
2. Looks like a technical drawing but no legend entries → warn.
3. Rooms visible but nothing assigned to a room → warn.
4. LED strip with no length/quantity and not flagged for review → warn.
5. Many high-confidence items but no source page → warn.
6. Quote is marked **indicative** when: confidence is low, > 40% of document
   rows miss a quantity, only text/photo was used, the input is a
   photo/customer description, or a technical drawing has no legend.

## Project conversion (Phase 8)

Electrical sessions create grouped phases (worker-readable), not one task per
symbol — see `ELECTRICAL_EXECUTION_PHASES` in `symbolReading.ts`:

1. Príprava a kontrola podkladov
2. Obhliadka a overenie otvorených bodov
3. Hrubá elektroinštalácia / príprava trás
4. Montáž vývodov a svetelných prvkov
5. LED profily, LED pásy a osvetlenie
6. Zapojenie, testovanie a odovzdanie

Materials preserve room, item, quantity, unit, source and needsReview notes.

## UI (Phase 6)

`AiEstimatorReviewPanel` gains a **"Značky vo výkrese"** tab (only when symbol
data exists) with: legend entries, symbols found in drawing, unknown symbols to
review, and company-focus cards. This first version is a **read-only structured
review** — not a CAD editor. Editing/reassigning symbol types is a follow-up.

## Honest limitations

- This is **not** a real CAD/vector parser. It relies on Gemini vision reading a
  rasterized/inline PDF page. It does not compute pixel bounding boxes.
- Cable lengths cannot be reliably derived from symbols alone (flagged as risk).
- Symbol reading quality depends on drawing legibility and a present legend.
- The UI review tab is read-only in this phase; symbol reassignment/editing and
  per-item exclude/convert actions are not yet implemented.
- Requires the four estimator Cloud Functions deployed + `GEMINI_API_KEY`.
