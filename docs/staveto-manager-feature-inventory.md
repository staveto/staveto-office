# Staveto Manager — Feature Inventory

**Document purpose:** Planning inventory for the Staveto Manager web application, grounded in the current `staveto-office` Next.js MVP workspace.  
**Last reviewed:** 2026-06-02  
**Mobile repository:** Not present in this workspace — mobile parity is **Inferred** from code comments and shared Firestore shapes unless otherwise noted.

---

## Evidence tags

| Tag | Meaning |
|-----|---------|
| **Verified** | Confirmed in `staveto-office` source, routes, or `docs/FIRESTORE_RULES_NOTES.md`. |
| **Inferred** | Reasonable from naming, comments, or typical mobile/Firebase patterns; not fully inspectable here. |
| **Planned** | Target for Staveto Manager; no or minimal implementation in office MVP. |
| **Blocked** | Depends on missing mobile schema docs, backend contracts, or external systems in this workspace. |

---

## Current codebase snapshot

| Area | Status | Evidence |
|------|--------|----------|
| Repository | `staveto-office` (private npm package `staveto-office@0.1.0`) | **Verified** — `package.json` |
| Framework | Next.js 16 App Router, React 19, TypeScript, Tailwind 4, shadcn/base-ui | **Verified** |
| Auth backend | Firebase Auth (Google popup, email/password), `browserLocalPersistence` | **Verified** — `src/lib/firebase.ts` |
| Data backend | Firestore client SDK for users, organizations, projects, tasks, expenses; Cloud Functions callable `getBillingStatus` (`europe-west1`) | **Verified** |
| Estimates / legacy quotes UI | In-memory server store via `/api/estimates` — **not** shared Firestore quotes model | **Verified** — `src/lib/estimatesStore.ts`, README |
| i18n | EN + SK via `src/i18n/translations.ts` | **Verified** |
| Deploy target | `app.staveto.com` (README) | **Verified** |
| File count (TS/TSX) | ~51 application files under `src/` | **Verified** — glob scan |
| PWA / service worker | None | **Verified** — no `manifest`, no SW |
| Dedicated `services/` layer | None — Firestore access in `src/lib/*.ts` | **Verified** |

### Route map (implemented pages)

| Route | Page | Auth |
|-------|------|------|
| `/login` | Email + Google sign-in | Public |
| `/register` | Sign-up | Public |
| `/join?token=` | Accept org invite | Public → auth redirect |
| `/onboarding` | Multi-step profile + team invites | Authenticated |
| `/app` | Overview dashboard | Authenticated + onboarding |
| `/app/projects` | Project list (workspace-scoped) | Authenticated |
| `/app/projects/new` | Create project | Authenticated |
| `/app/projects/[id]` | Project detail: overview, tasks, expenses tabs | Authenticated + `hasProjectAccess` |
| `/app/members` | Org members + invites (team admin UI) | Authenticated |
| `/app/billing` | Team org plan / seats | Authenticated (team workspace) |
| `/app/settings` | Placeholder | Authenticated |
| `/app/help` | FAQ | Authenticated |
| `/app/quotes` | Placeholder (“Coming soon”) | Authenticated |
| `/estimates`, `/estimates/new`, `/estimates/[id]` | CRUD via REST API (in-memory) | Authenticated |
| `/subscription` | Personal trial / Pro messaging | Authenticated (sidebar: personal only) |

**Note:** `/app/quotes` exists but is **not** linked in `Sidebar.tsx` WORK_ITEMS (only `/estimates` is). **Verified**

---

## Verified modules (present in MVP)

| Module | Implementation summary | Key paths |
|--------|-------------------------|-----------|
| Auth | Firebase Google + email; `AuthContext`; `AuthGuard`; public paths | `src/context/AuthContext.tsx`, `src/components/layout/AuthGuard.tsx`, `src/app/login/page.tsx` |
| Onboarding | 4-step wizard; `users.onboarding`; optional org + invites | `src/app/(app)/onboarding/page.tsx`, `src/lib/userProfile.ts` |
| Workspace (UI) | Personal + team switcher; team = `organizations/{orgId}` | `src/context/WorkspaceContext.tsx`, `src/components/layout/Header.tsx` |
| Projects | Firestore list/create; workspace via `ownerId` / `orgId` | `src/lib/projects.ts`, `src/app/(app)/app/projects/**` |
| Tasks | Subcollection CRUD subset (create, toggle status); no assignee UI | `src/lib/projects.ts`, project detail tabs |
| Expenses | Subcollection full CRUD on project detail | `src/lib/projects.ts` |
| Team / Roles (org) | `organizations`, `members`, `invites`; admin/member | `src/lib/organizations.ts`, `src/app/(app)/app/members/page.tsx` |
| Estimates (office) | In-memory MVP, separate from mobile quotes | `src/lib/estimatesStore.ts`, `src/app/api/estimates/**` |
| Billing (read) | `getBillingStatus` callable; subscription + team billing pages | `AuthContext`, `src/app/(app)/subscription/page.tsx`, `billing/page.tsx` |
| i18n | EN/SK | `src/i18n/**` |

---

## Missing modules (Manager target, absent or stub in MVP)

| Module | MVP state | Blocker / dependency |
|--------|-----------|----------------------|
| Quotes (Firestore) | Stub page only; estimates are separate store | Mobile quote schema + service layer **Blocked** without mobile repo |
| Quote PDF | None | PDF pipeline + template **Planned** |
| Invoices | None | Mobile invoice collections **Inferred** |
| Invoice PDF | None | Same as quotes PDF **Planned** |
| Customers | None | CRM collection parity **Inferred** |
| Calendar | None | Events collection + sync **Planned** |
| Attendance | None | Time-tracking schema **Inferred** |
| Documents | None | Firebase Storage + metadata **Planned** |
| Issues | None | Issue/defect tracking **Planned** |
| Reports | None | Aggregations across modules **Planned** |
| AI | None | Agent + confirmation UX **Planned** |
| Integrations | None | OAuth / webhooks **Planned** |
| Audit | None | Append-only audit log collection **Planned** |
| PWA | None | manifest, SW, offline policy **Planned** |
| Manager dashboard | Minimal overview card | KPIs, cross-module widgets **Planned** |
| Settings | “Coming soon” | Profile, org, notifications **Planned** |

---

## Mobile gap analysis

The mobile app repository is **not** in this workspace. Gaps are documented from **Verified** web comments and Firestore field usage.

| Capability | Mobile (expected) | Web MVP (`staveto-office`) | Gap severity |
|------------|-------------------|----------------------------|--------------|
| Projects / tasks / expenses | Shared Firestore paths | Implemented; `projects.ts` states “Same data model as mobile app” | **Low** for core project ops |
| Quotes / estimates | Firestore `quotes` (or equivalent) | Estimates = in-memory API only; `/app/quotes` stub | **High** |
| Invoices | Full lifecycle | Not present | **High** |
| Customers | Address book / clients | Not present | **High** |
| Calendar / attendance | Field ops scheduling | Not present | **High** |
| Documents / photos | Storage-linked | Not present | **High** |
| Issues / snags | Defect lists | Not present | **Medium** |
| Offline / PWA | Native + possible web PWA | Web online-only | **Medium** (web-specific) |
| Subscriptions | Store / native billing | Callable + messaging “use mobile app” | **Medium** — by design in MVP |
| RBAC granularity | Role matrices per feature | Org `admin` \| `member` only | **Medium** |
| AI actions | Mobile assistants (if any) | None | **Unknown** — **Blocked** |
| `workspaceId` on all entities | Gradual rollout on mobile | Set on **new** projects only | **Medium** — backfill **Planned** |

**Principle:** Web must not introduce breaking Firestore field renames or collection moves that mobile still reads. Prefer additive fields (`workspaceId`, `workspaceType`) and dual-read during migration. **Planned** architecture policy.

---

## Manager dashboard

| Widget / area | Status | Evidence |
|---------------|--------|----------|
| Welcome + workspace name | **Verified** | `src/app/(app)/app/page.tsx` |
| Estimates quick action | **Verified** | Links to `/estimates/new` |
| Project count / open tasks | **Planned** | Overview shows “—” for metrics |
| Revenue / quotes pipeline | **Planned** | No Firestore quotes |
| Team activity feed | **Planned** | No audit log |
| Calendar today | **Planned** | No calendar module |
| AI suggestions | **Planned** | No AI |

Target Manager dashboard should be role-aware (craftsman vs manager vs accountant) using onboarding `role` already stored on `users.onboarding.role`. **Verified** field, **Planned** UI use.

---

## Core modules — detailed tables (21)

### 1. Auth

| Attribute | Value |
|-----------|-------|
| Evidence | **Verified** |
| MVP | Google OAuth, email/password sign-in/up, `AuthGuard`, session via Firebase |
| Data | Firebase Auth only; profile in `users/{uid}` |
| Routes | `/login`, `/register`; redirect `?next=` |
| Gaps | Forgot-password route referenced in guard but page may be missing; no MFA; no SSO |
| Manager target | Same Firebase project; optional magic link; session refresh policy; device management **Planned** |

### 2. Onboarding

| Attribute | Value |
|-----------|-------|
| Evidence | **Verified** |
| MVP | Steps: purpose, role, team size, invite emails; writes `users.onboarding`; may create org + invites |
| Data | `users.onboarding.*`, `organizations`, `invites` |
| Gaps | No skip for returning mobile users; no workspace picker |
| Manager target | Detect mobile-completed profile; shorten web path **Planned** |

### 3. Workspace

| Attribute | Value |
|-----------|-------|
| Evidence | **Verified** (UI), **Inferred** (long-term model) |
| MVP | `WorkspaceContext`: `personal` (synthetic id) + `team` (org id); switcher in header |
| Data | Projects use `ownerId` + `orgId` + optional `workspaceId` / `workspaceType` |
| Gaps | No `workspaces` collection; org scan for memberships is O(n orgs) **Verified** in `getUserOrgMemberships` |
| Manager target | Gradual `workspaceId` on reads/writes; bridge via `organizations` — **no big-bang** collection rename **Planned** |

### 4. Projects

| Attribute | Value |
|-----------|-------|
| Evidence | **Verified** |
| MVP | List (50), create, detail; archived filter; access check |
| Firestore | `projects/{id}`, fields align with mobile types in `ProjectDoc` |
| Gaps | No archive UI; no share/link; no project types UI beyond optional fields |
| Manager target | Filters, templates, linking to quotes/invoices **Planned** |

### 5. Tasks

| Attribute | Value |
|-----------|-------|
| Evidence | **Verified** (partial) |
| MVP | List, create, toggle DONE/OPEN; subcollection `projects/{id}/tasks` |
| Gaps | No phases, assignees, due dates in UI; no bulk edit |
| Mobile parity | Fields exist in `TaskDoc` (`phaseId`, `assigneeId`, `dueDate`) — **Verified** types, **Planned** UI |

### 6. Expenses

| Attribute | Value |
|-----------|-------|
| Evidence | **Verified** |
| MVP | CRUD with categories MATERIAL, WORK, OTHER, TRAVEL; `source: MANUAL`, `status: READY` on create |
| Gaps | No receipt upload; no approval workflow |
| Manager target | Approval + export; link to reports **Planned** |

### 7. Quotes

| Attribute | Value |
|-----------|-------|
| Evidence | **Planned** (Firestore), **Verified** (stub) |
| MVP | `/app/quotes` placeholder; real quote UX still under `/estimates` in-memory |
| Mobile | Firestore-backed quotes **Inferred** |
| Manager target | Replace estimates store; workspace-scoped queries; status workflow aligned with mobile **Planned** |

### 8. Quote PDF

| Attribute | Value |
|-----------|-------|
| Evidence | **Planned** |
| MVP | None |
| Manager target | Server-side render (Cloud Function or Next route); store PDF in Storage; same template as mobile **Planned** |

### 9. Invoices

| Attribute | Value |
|-----------|-------|
| Evidence | **Planned** |
| MVP | None |
| Mobile | Invoice collections **Inferred** |
| Manager target | Issue from quote; numbering; tax; payment status **Planned** |

### 10. Invoice PDF

| Attribute | Value |
|-----------|-------|
| Evidence | **Planned** |
| MVP | None |
| Manager target | Shared PDF service with quotes; legal fields per locale (SK/CZ) **Planned** |

### 11. Customers

| Attribute | Value |
|-----------|-------|
| Evidence | **Planned** |
| MVP | Client name/email only on estimates |
| Manager target | `customers` collection (or embedded) shared with mobile; link to quotes/invoices **Planned** |

### 12. Calendar

| Attribute | Value |
|-----------|-------|
| Evidence | **Planned** |
| MVP | None |
| Manager target | Month/week views; project + task due dates; external sync later **Planned** |

### 13. Attendance

| Attribute | Value |
|-----------|-------|
| Evidence | **Planned** |
| MVP | None |
| Mobile | Time entries **Inferred** |
| Manager target | Team timesheets; export for payroll integrations **Planned** |

### 14. Documents

| Attribute | Value |
|-----------|-------|
| Evidence | **Planned** |
| MVP | None |
| Manager target | Storage paths per project; permissions via RBAC; virus scan **Planned** |

### 15. Issues

| Attribute | Value |
|-----------|-------|
| Evidence | **Planned** |
| MVP | None |
| Manager target | Defects linked to project locations; assignee; photos **Planned** |

### 16. Team / Roles

| Attribute | Value |
|-----------|-------|
| Evidence | **Verified** (org-level) |
| MVP | `admin` \| `member`; invites with token; join flow; seat limits by plan TEAM_5/15/30 |
| Gaps | No per-project roles; no custom permissions |
| Manager target | RBAC matrix (feature × role); project-level overrides **Planned** |

### 17. Reports

| Attribute | Value |
|-----------|-------|
| Evidence | **Planned** |
| MVP | None |
| Manager target | P&L by project, expense breakdown, quote conversion; CSV export **Planned** |

### 18. AI

| Attribute | Value |
|-----------|-------|
| Evidence | **Planned** |
| MVP | None |
| Manager target | Agent for draft quotes, expense categorization, schedule hints; **confirmation required** for send invoice, delete, role change, billing **Planned** |

### 19. Integrations

| Attribute | Value |
|-----------|-------|
| Evidence | **Planned** |
| MVP | None |
| Manager target | Accounting (e.g. export), calendar (Google), webhooks; secrets in Functions **Planned** |

### 20. Audit

| Attribute | Value |
|-----------|-------|
| Evidence | **Planned** |
| MVP | None |
| Manager target | Append-only `auditLogs` with actor, workspace, entity, diff; admin viewer **Planned** |

### 21. PWA

| Attribute | Value |
|-----------|-------|
| Evidence | **Planned** |
| MVP | Responsive layout + mobile sidebar **Verified**; no install/offline |
| Manager target | `manifest.webmanifest`, SW for shell cache; read-only offline for projects **Planned** |

---

## Summary matrix

| Module | MVP | Firestore | Mobile parity | Manager priority |
|--------|-----|-----------|---------------|------------------|
| Auth | ✅ | N/A (Auth) | High | P0 |
| Onboarding | ✅ | ✅ | Medium | P0 |
| Workspace | 🟡 UI | 🟡 partial fields | High | P0 |
| Projects | ✅ | ✅ | High | P0 |
| Tasks | 🟡 | ✅ | Medium | P1 |
| Expenses | ✅ | ✅ | High | P1 |
| Quotes | ❌ | ❌ (stub) | Critical | P0 |
| Quote PDF | ❌ | — | High | P1 |
| Invoices | ❌ | **Inferred** | Critical | P1 |
| Invoice PDF | ❌ | — | High | P2 |
| Customers | ❌ | **Inferred** | High | P1 |
| Calendar | ❌ | **Inferred** | Medium | P2 |
| Attendance | ❌ | **Inferred** | Medium | P2 |
| Documents | ❌ | **Inferred** | High | P2 |
| Issues | ❌ | **Inferred** | Medium | P2 |
| Team/Roles | ✅ org | ✅ | High | P0 |
| Reports | ❌ | — | Medium | P2 |
| AI | ❌ | — | Low | P3 |
| Integrations | ❌ | — | Medium | P3 |
| Audit | ❌ | — | High | P1 |
| PWA | ❌ | — | Web-only | P2 |

Legend: ✅ done · 🟡 partial · ❌ missing

---

## Open questions

1. **Quotes collection name and schema** — What is the exact Firestore path and document shape for mobile quotes? Required before deprecating in-memory estimates. (**Blocked** without mobile repo.)

2. **Estimates migration** — Migrate existing in-memory estimates to Firestore or drop MVP data? (**Planned** product decision.)

3. **Workspace collection** — Will a top-level `workspaces` collection ever exist, or is `organizations` + `ownerId` the permanent bridge? Architecture doc assumes bridge only. (**Planned**)

4. **`workspaceId` backfill** — Batch job vs lazy-on-write for legacy projects? (**Planned**)

5. **Billing source of truth** — Team org billing vs personal `getBillingStatus` — single subscription per user or per org? (**Inferred** partial; needs product spec.)

6. **Quote PDF ownership** — Generate on web only, mobile only, or shared Cloud Function? (**Planned**)

7. **RBAC roles** — Expand beyond `admin`/`member` to match mobile (e.g. accountant read-only)? (**Planned**)

8. **AI scope for v1** — Read-only suggestions vs write with confirmation? (**Planned** — confirmation required for sensitive writes per principles.)

9. **Domain strategy** — `app.staveto.com` vs future `manager.staveto.com`? (**Inferred** from README.)

10. **Firestore rules** — `docs/FIRESTORE_RULES_NOTES.md` is draft; who owns production rules deployment? (**Verified** notes exist; deployment **Blocked** in repo.)

11. **Invites index** — Composite indexes documented; are all production indexes created? (**Verified** documentation; runtime **Inferred**.)

12. **Cross-workspace search** — Should managers search all orgs they belong to? (**Planned**)

---

## Related documents

- [staveto-manager-architecture.md](./staveto-manager-architecture.md) — target architecture, phases 0–14, migration strategy.
- [FIRESTORE_RULES_NOTES.md](./FIRESTORE_RULES_NOTES.md) — draft security rules and indexes (**Verified**).

---

## Document history

| Date | Change |
|------|--------|
| 2026-06-02 | Initial inventory from `staveto-office` codebase scan |
