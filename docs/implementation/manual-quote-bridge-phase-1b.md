# Phase 1B — Manual quote bridge

**Date:** 2026-07-20  
**Scope:** Wire the existing manual quote editor into the project quote tab. No PDF takeoff, market catalog, supplier offers, DPH engine, snapshots, assemblies, invoicing, planning, or Firestore rules changes.

## Existing editor used

| Item | Value |
|------|--------|
| Component | `DraftQuoteItemsPanel` |
| Path | `src/components/jobs/DraftQuoteItemsPanel.tsx` |
| Mounted from | `ProjectQuoteTab` → `ProjectDashboard` when sales draft + `NEXT_PUBLIC_ENABLE_MANUAL_QUOTE_WORKSPACE` |
| Catalog picker | `src/components/projects/setup/CatalogItemPickerDialog.tsx` |

## Quote route / tab

- URL: `/app/projects/{projectId}?tab=quote` (no new `/quote` route)
- Helper: `projectQuoteTabHref()` / `projectCreateLandingHref()` in `src/lib/projectCreationFeature.ts`

## Source of truth

Draft lines remain:

`projects/{projectId}/quoteItems`

APIs: `listProjectQuoteDraftItems` / `createQuoteDraftItem` / `updateQuoteDraftItem` / `deleteQuoteDraftItem` in `src/lib/projects.ts`.

## Sync to top-level quotes

Unchanged: `upsertQuoteFromProject` in `src/services/quotes/quoteService.ts`  
(`quoteItems` → resolve lines → create/update `quotes/{quoteId}`).

Autosave of draft lines does **not** create a new top-level quote. Upsert runs only when the user clicks “create quote from project”.

## Firemný katalóg

- Workspace collection: `workspaces/{workspaceKey}/catalogItems`
- Picker labels: **Firemný katalóg** (not market / online prices)
- Insert = **copy** name/unit/unitPrice into `quoteItems`
- Editing a quote line does not update the catalog item
- Deleting a quote line does not delete the catalog item

## Manual items

Fields: name, optional description (`note`), qty, unit (`QUOTE_DRAFT_UNITS`), unit sell price, existing VAT % + notes on the project draft. No purchase price, supplier, margin, or market prices.

## AI separation

- Default quote tab does **not** show “Vytvoriť pomocou AI” / `?setup=ai` CTAs when the manual flag is on
- Historical `/app/projects/{id}?setup=ai` still opens `AiProjectSetupWorkspace`
- Saving notes uses `mergeQuoteDraftPlainNotes` so AI JSON in `quoteDraftNotes` is not wiped
- No AI services are called from the manual editor

## Redirects

| Flow | Destination |
|------|-------------|
| Create (`createDraftJob`) | `/app/projects/{id}?tab=quote` |
| Copy (`copyProjectConcept`) | `/app/projects/{copiedId}?tab=quote` |

When `NEXT_PUBLIC_ENABLE_MANUAL_QUOTE_WORKSPACE=0` → `/app/projects/{id}` (Phase 1A landing).

## Customer validation

- Draft editing works without a customer
- Soft inline hint for `customer_job` / large construction (non-blocking)
- Creating / sending a top-level quote requires a customer (`projectHasQuoteCustomer`); message: *Pred odoslaním ponuky doplňte zákazníka.*
- Send PDF buttons remain “coming soon”; gate runs if clicked when enabled later

## Feature flag

| Flag | Default | Rollback |
|------|---------|----------|
| `NEXT_PUBLIC_ENABLE_MANUAL_QUOTE_WORKSPACE` | **ON** (`!== "0"`) | set `=0` → legacy quote tab + `?setup=ai` CTAs + create lands on project detail |

Logic is in `isManualQuoteWorkspaceEnabled()` / `shouldShowManualQuoteEditor()` — not CSS-only.

## Autosave

Debounced (~900 ms) row updates + meta VAT/notes (~800 ms). Status: Ukladám… / Uložené / Chyba uloženia. Failed updates do not create duplicate lines (update by id; create only on explicit add).

## Tests

- `src/lib/projectCreationFeature.test.ts` — flag + landing href
- `src/lib/manualQuoteWorkspace.test.ts` — units, notes merge, customer, delete confirm, editor gate
- `src/lib/projectDashboard.quoteHref.test.ts` — dashboard/list CTAs → `?tab=quote`
- `src/components/jobs/new/newJobWizardTypes.test.ts` — simplified wizard path (unchanged)

## Known limitations (before SK product catalog)

- No market / internet product prices
- No supplier offers or purchase price
- No new DPH engine or quote snapshots
- No PDF takeoff workspace in this tab
- Top-level quote “send” still coming soon
- Company catalog may be empty until import / manual catalog entries exist

## Rollback

1. Set `NEXT_PUBLIC_ENABLE_MANUAL_QUOTE_WORKSPACE=0`
2. Redeploy / restart
3. Quote tab restores AI CTAs; create/copy land on `/app/projects/{id}`
