# Phase 1C — Project → quote flow hardening

**Date:** 2026-07-20  
**Decision:** **CONDITIONAL GO** for Slovak product catalog phase  
**Scope:** Audit + stabilize Fázy 1A/1B. No new product/quote model, PDF workspace, DPH, suppliers, or rules migration.

## Verified flow

```text
/app/projects/new
  → Zákazník → Informácie
  → createDraftJob
  → /app/projects/{projectId}?tab=quote
  → DraftQuoteItemsPanel
  → projects/{projectId}/quoteItems

copyProjectConcept
  → /app/projects/{copiedProjectId}?tab=quote

Explicit CTA only:
  quoteItems → upsertQuoteFromProject → quotes/{quoteId}

Historical:
  /app/projects/{id}?setup=ai → AiProjectSetupWorkspace (unchanged)
```

## Source of truth

| Layer | Path |
|-------|------|
| Draft lines | `projects/{projectId}/quoteItems` |
| Company catalog templates | `workspaces/{workspaceKey}/catalogItems` |
| Official quote | `quotes/{quoteId}` (via existing upsert) |

**Grep (2026-07-20):** no `quoteDrafts` collection references under `src/`.  
Draft editor does not call `updateCatalogItem` / `deleteCatalogItem`.  
Autosave uses `updateQuoteDraftItem` only; `upsertQuoteFromProject` is explicit CTA.

## Git diff audit (1A + 1B + post-1B AI improve)

### In-scope / expected

- `projectCreationFeature.ts` (+ tests), `manualQuoteWorkspace.ts` (+ tests)
- `NewJobForm.tsx`, wizard types, preview, e2e helpers
- `DraftQuoteItemsPanel.tsx`, `ProjectQuoteTab.tsx`, `ProjectDashboard.tsx` (props only)
- `projectDashboard.ts` quote hrefs, `CatalogItemPickerDialog` comment/labels
- `vitest.config.ts` — **adds** include globs for new tests (does not exclude failing tests)
- `improveBriefService.ts` + `DescriptionWithAiImprove.tsx` (user ask: restore AI text polish on description — not catalog)

### Related 1A settings (legacy gate)

- `WorkTypeSettings.tsx` deprecation comment
- `settings/company/page.tsx` (legacy work-type settings visibility)

### vitest.config.ts

Only **additive** includes:

- `projectCreationFeature.test.ts`
- `manualQuoteWorkspace.test.ts`
- `quoteDraftAutosave.test.ts` (1C)
- `projectDashboard.quoteHref.test.ts`
- `newJobWizardTypes.test.ts`

No tests were removed to greenwash the suite.

### Risk notes (documented, not reverted)

- `DescriptionWithAiImprove` / `improveBriefService` call `improveProjectBrief` on the **new-job description** field only — not from the manual quote editor.
- Mock supplier catalog (`mockSupplierConnector`) remains unused by the new project→quote flow.

## Lint discrepancy explained

### Command that produced “5 problems (2 errors, 3 warnings)”

```bash
npx eslint src/components/projects/detail/ProjectDashboard.tsx \
  src/components/projects/setup/CatalogItemPickerDialog.tsx
```

(Phase 1B “lint changed files” batch that included these two.)

| File | Line | Severity | Rule | Introduced by 1A/1B? |
|------|------|----------|------|----------------------|
| `ProjectDashboard.tsx` | 118 | warning | unused `openProblemsCount` | **No** (pre-existing) |
| `ProjectDashboard.tsx` | 172 | error | `prefer-const` `resolvedDocs` | **No** (pre-existing) |
| `ProjectDashboard.tsx` | 201 | warning | `react-hooks/exhaustive-deps` | **No** (pre-existing) |
| `ProjectDashboard.tsx` | 208 | warning | unused `investedMinutes` | **No** (pre-existing) |
| `CatalogItemPickerDialog.tsx` | 77 | error | `react-hooks/set-state-in-effect` | **No** (pre-existing; 1B only changed comment) |

1B diff on `ProjectDashboard` only added props to `ProjectQuoteTab`.  
Verified via `git show HEAD:…` that the same patterns existed before.

### Full lint vs changed-files lint

Same ESLint config (`npm run lint` = `eslint`).  
Full repo: **1787 problems (47 errors, 1740 warnings)** — mostly pre-existing debt.  
Changed-files lint for 1C core modules: clean of **new** errors.

**Not fixed in 1C:** pre-existing Dashboard / Catalog picker lint (does not block project→quote flow).

## Autosave behaviour (hardened in 1C)

- Debounce ~900 ms; timer always persists **latest** `rowsRef` value (not a stale closure).
- Per-row generation token: newer edits supersede in-flight writes (`shouldApplyAutosaveResult`).
- Unmount flushes dirty rows (best-effort).
- Status: Ukladám… / Uložené / Chyba.
- Create/update failures do not invent duplicate ids (update by id; create only on explicit add).
- Autosave never calls `upsertQuoteFromProject`.

## KPI refresh

| Finding | Detail |
|---------|--------|
| Parent state | `ProjectDashboard` already passes `onQuoteItemsChanged={setQuoteItems}` |
| Overview tab | Does **not** render quote line totals / `ProjectKpiCards` (component unused) |
| Quote tab | Editor holds its own list + syncs parent via callback |
| Conclusion | No page reload needed; overview has no live quote-sum KPI to refresh. Documented only — no large refactor. |

## Multi-tenancy (no rules change)

- `quoteItems` under `projects/{projectId}` — access via existing `hasProjectAccess` / draft assert.
- Catalog via `getWorkspaceStorageKey` → `workspaces/{uid\|orgId}/catalogItems` (org A ≠ org B).
- Existing `catalogItemsService.test.ts` asserts workspace isolation.
- 1C path helpers encode SoT + catalog separation for regression.

## Feature flag rollback

`NEXT_PUBLIC_ENABLE_MANUAL_QUOTE_WORKSPACE=0`:

- Create/copy land on `/app/projects/{id}`
- Quote tab restores legacy AI CTAs (`?setup=ai`)
- No data migration

## Manual acceptance scenarios

| ID | Scenario | Result |
|----|----------|--------|
| A | Existing customer → create → `?tab=quote` → edit lines → refresh | **Code-verified** redirect + SoT; UI smoke needs login |
| B | New contact once + `customerId` | Unchanged `createCustomer` + `createDraftJob` path |
| C | No customer → edit draft; publish gated | Soft hint + `projectHasQuoteCustomer` on upsert CTA |
| D | Catalog copy → price edit → delete quote line | Copy-only insert; no catalog write/delete |
| E | Copy → new id → `?tab=quote` | `projectCreateLandingHref` |
| F | Legacy `?setup=ai` | Still mounted in `projects/[id]/page.tsx` |
| G | Flag off/on | Unit-tested helpers |

**E2E:** authenticated `e2e/projects-new.spec.ts` skipped without `E2E_EMAIL` / `E2E_PASSWORD`.

## Tests added/updated

- `quoteDraftAutosave.test.ts` — SoT paths, generation races, panel contracts
- `manualQuoteWorkspace.test.ts` — draft without customer, flag rollback
- Existing 1A/1B redirect + href tests retained

## Open issues

1. Repo-wide ESLint debt (47 errors) unrelated to this flow.
2. No Playwright coverage for quote tab CRUD without E2E credentials.
3. `ProjectKpiCards` dead code — optional cleanup later.
4. AI text improve on new-job description remains available (intentional product ask); not part of quote editor.

## Decision for catalog phase

**CONDITIONAL GO**

Proceed to Slovak product catalog **only if**:

- Manual A/D smoke is confirmed once in a logged-in local/staging session, and
- Catalog work stays additive (new market sources) without replacing `quoteItems` SoT or forcing AI on create.
