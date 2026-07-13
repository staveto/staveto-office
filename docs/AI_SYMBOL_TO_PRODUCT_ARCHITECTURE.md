# AI Symbol → Assembly → Product architecture

> Feature flags:
> - `NEXT_PUBLIC_ENABLE_AI_ESTIMATOR_FLOW=1`
> - `NEXT_PUBLIC_ENABLE_AI_SYMBOL_LIBRARY=1`
> - `NEXT_PUBLIC_ENABLE_PRODUCT_SOURCING=1` (prices / product cards)

## Why official symbols alone are not enough

Every architect can draw electrical marks differently. A circle-X may mean a light in one plan and something else in another. Gemini vision can **guess**, but Staveto must:

1. Prefer **this project’s legend**
2. Normalize to a **technical point** (not a product)
3. Expand to an **assembly template** (materials + labor)
4. Then search **products/prices**

A symbol is never sold as a product by itself.

## Source priority

1. `project_legend`
2. `user_confirmed`
3. `company_custom`
4. `licensed_standard_pack` (slot only until licensed)
5. `standard_reference_metadata` (IEC/ISO/STN **metadata + text aliases**)
6. `ai_inferred`
7. `unknown` → human review (never dropped)

AI **cannot** override the project legend.

## Licensing note

Do **not** embed official IEC 60617 / ISO 14617 / STN glyph drawings unless you have a license.

Repo contains:

- Standard **names / applicability / licenseStatus**
- Safe **text aliases** (`internal_sample`)
- Pack **slots**: `IEC60617LicensedPack`, `STNElectricalLicensedPack`, `CompanyCustomSymbolPack`

## Symbol resolver

`resolveDrawingSymbol(candidate, context)` in `src/lib/ai/symbolResolver.ts`.

Context: legend rows, company/user mappings, country, optional licensed entries, AI guess.

Ambiguous or overlapped marks → `needsReview=true`.

## Assembly templates

`src/lib/ai/electricalAssemblyTemplates.ts`

Starters: socket, double socket, switch, dimmer, ceiling/pendant/wall light, LED system, DB, cable placeholder, testing/revision.

Cable lengths are **never invented** (`needs_measure`).

## Mapping

`mapSymbolsToAssemblies(...)` → assemblies, quote groups, `productSearchIntents`, questions, risks, `blocksFixedQuote`.

## Product mapping

Each `productRequired` material line becomes a `ProductSearchIntent` (category, qty, keywords, missing specs).  
Missing specs → do not auto-confirm product; mark review / block fixed quote.

## Pricing

Connect with product sourcing (`NEXT_PUBLIC_ENABLE_PRODUCT_SOURCING=1`).  
Customer quote uses **quote groups** (Zásuvky a vypínače, LED systémy, …).  
Internal purchase list keeps exact products.

## Human review

UI section **„Značka → položka → produkt“** on the estimator **Počty symbolov** tab (`AiEstimatorSymbolAssemblySection`).

## Limitations

- Licensed packs not connected (slots only).
- Visual counting on drawings still placeholder (see product-sourcing / quantity-source docs).
- Assembly qty formulas are heuristics; site measure still required for cables/LED specs.
- Company custom mappings are in-memory API for now (no Firestore settings UI yet).
