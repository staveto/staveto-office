# Phase 1D — Quote-first landing and state-based project navigation

**Date:** 2026-07-19  
**Decision:** **GO** — new sales projects land on quote; no overview intermediate step  
**Scope:** Client navigation / UX only. No Firestore model, quoteItems SoT, autosave, catalog, PDF takeoff, lifecycle values, or AI `?setup=ai` route changes.

## 1. Root cause (why smoke test landed on overview)

**NewJobForm already redirected correctly** via `projectCreateLandingHref(projectId)` → `/app/projects/{id}?tab=quote` (including after document upload).

The URL was then rewritten by **`ProjectDashboard`**:

| Item | Detail |
|------|--------|
| File | `src/components/projects/detail/ProjectDashboard.tsx` |
| Symbol | `useEffect` syncing `searchParams` → `activeTab` (pre-1D) |
| Mechanism | `parseTab(searchParams.get("tab"))` then `isProjectDashboardTabVisible(parsed, modules)` |
| Failure | If org module `quotes` was **off**, `?tab=quote` was treated as invisible → `setActiveTab("overview")` + `router.replace(...)` **deleting** `tab` → user saw overview |
| Secondary | `parseTab(null)` always returned `"overview"` with no sales/quote-prep awareness |

Upload and copy flows did **not** strip `tab=quote`; the dashboard visibility gate did.

## 2. Default-tab helper

**File:** `src/lib/projectDefaultTab.ts`

```ts
resolveProjectDefaultTab({
  requestedTab,
  projectPhase,
  lifecycleStatus,
  quoteStatus,
  manualQuoteWorkspaceEnabled,
  modules,
})
```

Also: `isQuotePreparationPhase`, `resolveProjectDefaultTabForProject`, `getOrderedProjectDashboardTabs`, `resolveProjectHeaderPrimaryAction`.

Rules:

1. Explicit valid URL tab wins (never rewrite `?tab=overview` → quote).
2. No tab + quote-prep (sales + new_request/draft equivalents + quote none/draft/ready) → `quote`.
3. Accepted / delivery → `overview`.
4. Historical deep links (`tasks`, `workplan`, `documents`, `activity`, `problems`) stay valid when present.
5. `?setup=ai` unchanged on project page (outside tab helper).
6. Soft-land only when URL has **no** `tab` and resolved is `quote` (single `replace`, no loop).
7. Quote tab stays reachable when `NEXT_PUBLIC_ENABLE_MANUAL_QUOTE_WORKSPACE` is on even if org `quotes` module is off (`getVisibleProjectDashboardTabs` in `projectDashboard.ts`).

## 3. Navigation rules

| Project state | Tab order (visible modules) | Default (no `?tab`) |
|---------------|-----------------------------|---------------------|
| Quote prep (sales / draft) | Ponuka → Dokumenty → Prehľad → Úlohy → Plán → Aktivita → … | `quote` |
| Delivery / accepted | Prehľad → Úlohy → Plán → Ponuka → Dokumenty → Aktivita → … | `overview` |

Flat strip (no “Viac” dropdown) — quote remains first and default in prep.

## 4. Post-create redirect

Unchanged contract from 1B, now **not overridden** by dashboard:

```text
createDraftJob → (optional upload) → projectCreateLandingHref(id)
→ /app/projects/{id}?tab=quote
```

Upload runs **before** `router.push`; landing href still includes `tab=quote`.

## 5. Copy redirect

```text
copyProjectConcept → projectCreateLandingHref(copiedId)
→ /app/projects/{copiedId}?tab=quote
```

## 6. Header + overview CTA

| Surface | Quote prep | Delivery |
|---------|------------|----------|
| Primary header CTA | Quote tab: „Náhľad ponuky“; else „Pokračovať v ponuke“ | „Otvoriť plán práce“ (or solve urgent tasks) |
| Work plan | Secondary menu only | Primary when no urgency |
| Overview next-step | Single „Pokračovať v ponuke“ → `?tab=quote`; no „Doplniť materiál“ | Existing delivery/accepted actions |
| Planning KPIs | Hidden when all zeros in quote prep | Shown |

## 7. Changed files

| File | Change |
|------|--------|
| `src/lib/projectDefaultTab.ts` | **New** helper |
| `src/lib/projectDefaultTab.test.ts` | **New** unit tests |
| `src/lib/projectDashboard.ts` | Quote visibility with manual flag; simplified next-step / actions |
| `src/components/projects/detail/ProjectDashboard.tsx` | Resolve tab via helper; soft-land; pass `project` / `activeTab` |
| `src/components/projects/detail/ProjectDetailTabs.tsx` | Ordered tabs by project state |
| `src/components/projects/detail/ProjectCompactHeader.tsx` | Quote-prep primary CTA; hide empty planning KPIs |
| `src/i18n/translations.ts` | SK/EN CTA + next-step keys |
| `vitest.config.ts` | Include `projectDefaultTab.test.ts` |
| `src/lib/projectDashboard.quoteHref.test.ts` | Expect `continueQuote` label |
| `docs/implementation/quote-first-landing-phase-1d.md` | This report |

**Not changed:** Firestore rules/model, `quoteItems` services, autosave, catalog, takeoff, lifecycle enums, AI setup page entry (`?setup=ai`).

## 8. Tests

```bash
npx vitest run \
  src/lib/projectDefaultTab.test.ts \
  src/lib/projectDashboard.quoteHref.test.ts \
  src/lib/projectCreationFeature.test.ts \
  src/lib/manualQuoteWorkspace.test.ts \
  src/lib/quoteDraftAutosave.test.ts \
  src/components/jobs/new/newJobWizardTypes.test.ts
```

Coverage mapped to requirements:

1. Create landing `?tab=quote` — `projectCreateLandingHref`  
2. Upload then landing keeps `tab=quote` — same href contract  
3. Copy landing `?tab=quote` — same  
4. No tab + sales/new_request → quote  
5. Explicit overview stays overview  
6. Explicit documents stays documents  
7. Delivery without tab → overview  
8. `setup=ai` when manual flag off  
9. Quote first in ordered tabs (draft)  
10. Overview first (delivery)  
11. Header CTA ≠ open plan in quote prep  
12. Header CTA = open plan in delivery  
13. Soft-land only when `!rawTab` (no rewrite of explicit tabs)  
14. No quote service / quoteItems changes in this phase  

**Result (2026-07-19):** 40+ related unit tests passed.

## 9. Typecheck

```bash
npx tsc --noEmit
```

**Result:** pass (exit 0).

## 10. Lint

```bash
npx eslint src/lib/projectDefaultTab.ts src/lib/projectDashboard.ts \
  src/components/projects/detail/ProjectDashboard.tsx \
  src/components/projects/detail/ProjectDetailTabs.tsx \
  src/components/projects/detail/ProjectCompactHeader.tsx
```

**Result:** pass on changed logic files. Pre-existing warnings in `ProjectDashboard` (`openProblemsCount`, `investedMinutes`, exhaustive-deps) remain documented, not introduced by 1D. Fixed incidental `prefer-const` on unused `resolvedDocs`.

## 11. Build

```bash
npm run build
```

**Result:** success (Next.js 16.1.6 Turbopack).

## 12. Manual smoke test

Suggested (local, logged-in workspace):

1. `/app/projects/new` → Zákazník → Informácie → create → URL ends with `?tab=quote`, editor visible.  
2. Same with 1–2 documents attached → still `?tab=quote`.  
3. Copy flow → copied project `?tab=quote`.  
4. Open `/app/projects/{id}` (no tab) on new sales draft → lands quote (URL gains `tab=quote`).  
5. Open `?tab=overview` explicitly → stays overview; one CTA „Pokračovať v ponuke“.  
6. Open delivery/accepted project without tab → overview; primary „Otvoriť plán práce“.  
7. Open `?setup=ai` on a project → AI setup still loads.  
8. Confirm no bounce between overview ↔ quote.

## 13. Rollback

1. Revert the files listed in §7 (or revert the 1D commit).  
2. Pre-1D behavior returns: dashboard may again strip `?tab=quote` when `quotes` module is off.  
3. Feature flag `NEXT_PUBLIC_ENABLE_MANUAL_QUOTE_WORKSPACE=0` disables quote-first defaults and restores `?setup=ai` CTAs without reverting code.

## Out of scope (unchanged)

- Quote editor redesign  
- Product catalog / online prices  
- PDF takeoff  
- Historical project data migration  
- Lifecycle value renames  
- AI historical route behavior beyond preserving `?setup=ai`
