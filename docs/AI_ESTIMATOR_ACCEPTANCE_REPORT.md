# AI Estimator / AI Kalkulant — Acceptance Report

> Date: 2026-07-13  
> Status: **PARTIAL PASS** — QuotePackage + quality gate + grouped UI shipped; live PDF E2E still limited by fixture + pricing

## Why the previous quote was not acceptable

Observed on real electrical PDF projects:

1. Raw AI rows were shown as the main customer quote (long flat list).
2. Classic sockets / switches often missing or incomplete while lighting dominated.
3. Cable types/lengths invented or absent without a clear strategy.
4. Drážky, boxes, distribution board, testing/revision not structured.
5. Material prices silently `0 €`; labor collapsed to generic `2 × 16 h`.
6. Customer PDF contained internal AI brief / English drawing analysis / `Job archetype` metadata.
7. Scope contradictions (e.g. “complete install” vs fixture install excluded).

## What shipped (2026-07-13)

### Two output layers

| Layer | Purpose | Location |
|-------|---------|----------|
| **InternalTakeoff** | Room/symbol/qty/source/confidence/needsReview | Material “Detailný výkaz”, estimator materials |
| **QuotePackage** | Grouped customer sections | `composeElectricalCustomerQuote`, offer step preview, quality gate |

### Quality gate

`validateElectricalEstimateCompleteness` checks 12 categories (lighting, LED, sockets, switches, cabling strategy, boxes, chasing, DB, testing, revision, material supply, customer fixtures). Missing commercially important categories → **Na kontrolu** + can block fixed quote.

### Symbol source architecture

`electricalSymbolLibrary.ts`: priority project legend → company → licensed pack → IEC/ISO **metadata only** → AI guess → unknown. Starter SK/DE aliases without copyrighted glyphs.

### Cable strategy

`buildCableStrategy`: **does not invent metres**. Adds needsReview “treba zamerať” + circuit categories + reserve note.

### Work breakdown

QuotePackage labor lines by category (sockets/switches/lights/LED/DB/testing) — not a single generic 16 h as the customer story (UI work step still editable; package adds structure).

### UI

- Material step: **grouped summary first**; raw list behind “Detailný výkaz”.
- Price missing banner; summary shows **Predbežná** when material total is 0.
- Offer step: clarity errors, QuotePackage section preview, customer-safe scope editing.

### Clarity validation

`validateQuoteClarity` fails on: material 0, generic-only labor, missing sockets/switches when hinted, missing cable strategy, English fragments in SK quote, >20 raw ungrouped rows, contradictions / blocked status.

## Automated tests

`src/lib/ai/electricalQuotePackage.test.ts`:

1. Quality gate catches missing sockets when `EL.zásuvka` hinted.
2. Missing switches when lighting present.
3. Cable strategy does not invent lengths.
4. LED rows aggregate in quote package.
5. Quote has multiple professional sections (not raw-only).
6. Clarity catches material 0 + English fragments.
7. Starter symbol aliases match.

## Live PDF fixture

`fixtures/ai-estimator/08_Znacenie_elektrika_2.pdf` — **still missing from repo** (README only).  
Until the file is present + Gemini path runs, sockets/switches detection on *this* PDF cannot be re-verified end-to-end in CI.

## Remaining limitations (honest)

- Page tile OCR / room crops (Phase 3 full pipeline) not fully implemented as a separate vision stage; still legend-first Gemini + post-processing gates.
- Licensed IEC 60617 glyph packs not embedded (by design — metadata + starter aliases only).
- Company pricebook integration is a CTA/warning, not auto-fill.
- Work step UI is still hours×rate; package labor lines guide structure but are not yet the sole pricing engine on PDF.
- Saved quote upsert may still sync many material lines — customer print filter + package preview reduce exposure; full PDF sectioned template is next step.

## Product sourcing (2026-07-13)

Feature flag: `NEXT_PUBLIC_ENABLE_PRODUCT_SOURCING=1`  
Doc: [`docs/AI_PRODUCT_SOURCING.md`](./AI_PRODUCT_SOURCING.md)

| Area | Status |
|------|--------|
| Types + connectors + matching service | **Shipped** |
| Mock supplier + CSV pricebook parser | **Shipped** (indicative mock prices) |
| Live wholesaler / supplier API | **Not yet** — architecture ready |
| Price step product cards + tiers + manual price | **Shipped** (flagged) |
| Missing price guard + clarity merge | **Shipped** |
| Internal purchase list on offer step | **Shipped** |
| Customer quote stays grouped (no internal meta) | **Shipped** |
| Company brand settings UI | **Defaults + hint** (full settings later) |

### Current project pricing honesty

With the flag on, the price step matches materials against the **mock SK electrical catalog** (and optional uploaded pricebook). Prices are **indicative**, always show source + date, and never stay silently `0` without a “Cena chýba” / review path. Quote totals update when products are selected (sell = net × waste × margin).

What remains mocked / manual:

- Live supplier search
- Persistent company pricebook storage / import UI
- Per-company brand preference settings screen

### Automated tests

`src/lib/products/productSourcing.test.ts` — zero-price warning, cost/margin math, brand ranking, LED needsReview, customer-supplied exclusion, purchase list code/source, customer quote hygiene, CSV parse.

## Pass / fail vs Phase 14 criteria

| Criterion | Status |
|-----------|--------|
| Sockets detected or flagged needsReview | **PASS (gate)** — flagged when text/legend hints; detection depends on Gemini session |
| Switches detected or flagged | **PASS (gate)** |
| Cable lengths not invented | **PASS** |
| Cable strategy added | **PASS** |
| Chasing in scope / open point | **PASS (package + gate)** |
| Installation boxes | **PASS (gate + package)** |
| DB scope clear or open | **PASS (gate)** |
| Testing/revision | **PASS (package)** |
| Quote grouped not raw flat | **PASS (UI + package)** |
| Material prices not silent 0 | **PASS (product sourcing flag)** — missing/indicative badges + guard; mock/pricebook when enabled |
| Labor not only generic story | **PARTIAL** — package structured; work step still simple |
| Customer PDF professional | **PARTIAL** — scope sanitized; full multi-page template pending |
| Raw extraction appendix only | **PASS (UI default)** |
| No English in SK quote path | **PASS (sanitize + clarity)** |
| No contradictory scope auto-text | **PASS (composer defaults)** |
| Product select / manual price / purchase list | **PASS (flag)** — live API still pending |

## Manual confirmation still required

- Count sockets/switches on dense marking plans.
- Cable metres after site measure.
- Material unit prices from company price list.
- Whether fixtures / LED drivers are customer-supplied.
- Whether revision is included.

## Deploy note

Estimator convert + facts functions were previously deployed; this change is primarily **client quote-layer**. Redeploy convert if server `customerScope` / materials companions need refresh:

```bash
firebase deploy --only functions:generateEstimatorFacts,functions:convertEstimatorSessionToProject,functions:syncEstimatorMaterialsToProject
```
