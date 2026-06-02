# Web alignment plan (from mobile source of truth)

**Document purpose:** Actionable plan for **staveto-office** (Manager Web) to align with the Staveto mobile app without breaking Firestore data or mobile clients.  
**Status:** Planning only — no implementation in the task that created this document.  
**Last reviewed:** 2026-06-03  

**Prerequisite reading:** [`mobile-source-of-truth-analysis.md`](./mobile-source-of-truth-analysis.md)

---

## 1. What web must change

| Priority | Change | Why |
|----------|--------|-----|
| P0 | **Stop treating `projectType` as archetype storage** | Mobile persists `BUILD` \| `TRADE` in `projectType`; archetypes are UI-layer |
| P0 | **On draft create, map archetype → `projectType` + `workType` + `jobWorkflowKind`** | Same rules as `resolveInternalProjectTypeFromArchetype` / `resolveJobWorkflowKindFromArchetype` in mobile |
| P0 | **Persist archetype in a dedicated optional field** (e.g. `jobArchetype`) unless mobile confirms another name | Keeps AI/context without corrupting engine field |
| P1 | **Organization reads** — surface `status`, `businessEnabled`, `planCode`, `seatsLimit`, `seatsUsed`, trial dates | Match Business gating on mobile |
| P1 | **Plan copy & billing UX** — user labels **Free / Solo / Business**; map `personal_pro` + RevenueCat `pro` → **Solo**; org `planCode` → **Business**; read-only Solo IAP on web | Do not sell Solo on web; do not treat Solo as Business |
| P1 | **Member roles** — read/display `owner`, `admin`, `manager`, `worker`, `viewer`; map legacy web `member` → `viewer` on read | Parity with `organizations/.../members` |
| P2 | **Company creation** — align with Business org provisioning (CF + `ownerUid`, server-only fields) | Web `createOrganization` with `TEAM_5` is a simplified subset |
| P2 | **Update [`staveto-work-types-ai-context.md`](./staveto-work-types-ai-context.md)** | Document correct field mapping after P0 |
| P3 | **Quotes labeling** — treat Firestore `quotes` as Manager interim; no claim of mobile parity | Avoid false sync expectations |

---

## 1.1 Corrected plan naming and billing ownership

| Program | User-facing (web) | Internal code | Who sells it | Web responsibility |
|---------|-------------------|---------------|--------------|-------------------|
| Free | **Free** | `free` | — | Show limits; no paywall |
| Solo | **Solo** (mobile may say “Staveto Pro”) | `personal_pro`, entitlement **`pro`**, `users.subscription` | **Apple / Google** via mobile **RevenueCat** | **Read status only** (`getBillingStatus`, profile fields); link user to mobile app for purchase/manage |
| Business | **Business** | `business` + org `planCode` | B2B order / activation flow | Company registration separate from Solo; gate team workspace on org `status` + `businessEnabled` |

**Web must:**

- Treat **Solo as a paid personal plan**, not onboarding-only and not Business.
- **Not** create or manage Apple/Google subscriptions in the browser.
- **Not** block personal jobs when user has Solo (`personal_pro`).
- **Not** grant Business team features from Solo alone.
- Allow **Business owner** to create/manage org workspace when Business licence is active.

**Onboarding disambiguation:** Step “personal / company” is a **usage path**; it does not set billing tier. A user on the personal path can be Free or Solo depending on entitlement.

---

## 2. What web should keep

- **Draft-first zákazka flow** — `phase: sales`, lifecycle on `projects`, convert to delivery; mobile can ignore until filtered.
- **`projects/{id}/quoteItems`** — pre-quote line prep; additive subcollection.
- **Firestore `quotes` collection** — internal Manager quotes until shared contract; link via `projectId`, `acceptedQuoteId`.
- **Workspace bridge** — `ownerId` / `orgId` on projects; **no** `workspaces/` collection.
- **Existing active projects** — `createProject` / delivery UI; legacy rows without sales fields.
- **SK-first UX** — zákazka, koncept, cenová ponuka, realizácia terminology.
- **Placeholder AI / email / PDF / Storage** — clear “čoskoro” messaging.
- **Legacy `/estimates`** — keep working with banner pointing to `/app/quotes` until deprecation decision.

---

## 3. What web should not implement yet

- Real **AI generation** (only context fields + copy)
- **Email** send/ingest, **PDF** export, **invoice** modules
- **Document/photo upload** (Storage) without mobile rules + paths
- **Calendar**, **attendance**, **reports** at mobile depth
- **New top-level collections** beyond agreed additive (`jobArchetype`, etc.)
- **Data migration scripts** that rewrite all historical `projects` in bulk
- **Forcing mobile** to show web draft jobs before mobile team adds filters
- **Replacing** mobile `materials` with web-only structures without import story

---

## 4. Exact fields / enums to reuse

### Plans — user-facing vs internal (corrected)

| User-facing (web UI) | Internal `PlanType` / signals | Notes |
|----------------------|-------------------------------|--------|
| **Free** | `free` | Default personal tier |
| **Solo** | `personal_pro` | Plus RevenueCat **`pro`**, `users.subscription`, `billingIsPro`, `hasPersonalProEntitlement`, `getBillingStatus` |
| **Business** | `business` | Requires active org + `businessEnabled` + membership |

**Do not** show internal `personal_pro` or “Pro” as the primary Manager label if product standard is **Solo** — map in a single display layer.

### B2B `planCode` (on `organizations` — server-written, Business only)

`business_starter` \| `business_team` \| `business_company`

Not used for Free or Solo.

### Onboarding usage path (not billing tier)

| Code term | Meaning |
|-----------|---------|
| `solo` / personal branch in onboarding | Personal **workspace** setup |
| `join_company` / company branch | Organization path |

`PrimaryUsageMode`: `build` \| `trade` — product preference, not plan.

### Job archetype (UI — store in optional `jobArchetype` recommended)

`service_inspection` \| `customer_job` \| `large_construction_project` \| `own_build` \| `internal_project`

### Firestore `projects.projectType` (storage — mobile engine)

`BUILD` \| `TRADE` (legacy: `MANAGEMENT`, `RESIDENTIAL`, `MAINTENANCE`, …)

### Firestore `projects.workType` (storage)

| Engine | Values |
|--------|--------|
| BUILD | `NEW_BUILD`, `RENOVATION`, `INSTALLATION`, `SERVICE` |
| TRADE | `INSTALLATION`, `REPAIR`, `RENOVATION`, `DELIVERY` |

### `projects.jobWorkflowKind`

`STANDARD` \| `SERVICE` (set for `service_inspection` archetype)

### Organization

| Field | Use |
|-------|-----|
| `ownerUid` | Owner (not `ownerId` on org doc) |
| `status` | Read-only on web client |
| `businessEnabled` | Read-only on web client |
| `seatsLimit`, `seatsUsed` | Read-only |
| `planCode`, `billingPeriod` | Read-only |
| `trialStartedAt`, `trialEndsAt` | Read |
| `activeBusinessOrderId` | Read |

### Org member `role`

`owner` \| `admin` \| `manager` \| `worker` \| `viewer`

### Web draft sales fields (keep — mobile may ignore)

`phase`, `lifecycleStatus`, `salesStatus`, `quoteStatus`, `customerRequest`, `customerName`, `customerEmail`, `customerPhone`, `source`, `convertedAt`, `acceptedQuoteId`, `quoteDraftVatPercent`, `quoteDraftNotes`

---

## 5. Migration-safe steps

1. **Read path (immediate, no migration)**  
   - `getProjectWorkType()` / badges: prefer `jobArchetype` if present; else if `projectType` matches archetype enum, treat as archetype; else treat `projectType` as BUILD/TRADE for engine display.  
   - Legacy web drafts remain visible.

2. **Write path (forward-only)**  
   - `createDraftJob`: set `jobArchetype`, `projectType` (BUILD/TRADE), `workType` (default sensible per archetype), `jobWorkflowKind` when needed.  
   - Do **not** write archetype strings into `projectType` for new docs.

3. **Optional backfill (later, explicit approval)**  
   - Batch script: for docs where `projectType` ∈ archetype set, copy to `jobArchetype` and recompute BUILD/TRADE — **not** in current scope.

4. **Quotes**  
   - No migration from in-memory estimates to Firestore required for mobile; keep separate until product unifies.

5. **Organizations**  
   - Web orgs with `plan: TEAM_5` coexist with mobile `planCode`; read both; do not delete `plan` until CF migration defined.

---

## 6. Priority order

| Order | Item |
|-------|------|
| 1 | Project type write alignment (`jobArchetype` + BUILD/TRADE + `workType`) |
| 2 | Read/display alignment (badges, detail, list) |
| 3 | Docs update (`staveto-work-types-ai-context.md`) |
| 4 | Organization/Business read model in web billing & members |
| 5 | Plan naming & billing UX — Free/Solo/Business labels, read-only Solo, Business registration |
| 6 | Quotes — document interim status; avoid mobile list pollution |
| 7 | Materials — import story on convert draft → active |
| 8 | Roles & permissions UI expansion |
| 9 | AI prompts wired to archetype + engine fields (still draft-only) |

---

## 7. Business workspace alignment

- **Personal workspace** = `ownerId` on projects (mobile solo).  
- **Team workspace** = `organizations/{orgId}` + `orgId` on projects; web “team” maps to mobile `workspaceType: team|business`.  
- **Do not** create `workspaces/` collection.  
- **Do not** use `AuthContext.orgId` pattern from mobile in web — web uses `WorkspaceContext` + `ActiveWorkspace`; ensure team workspace id = **organization id**, not user uid.  
- **Business gating UI** should read `organization.status` and `businessEnabled` before showing team features (mirror mobile capability `business` tier).  
- **Company creation** on web should converge on same post-conditions as mobile Business registration (order + activation), not only local `addDoc(organizations)`.

---

## 8. Project / work type alignment

### Target create payload (web draft)

```text
jobArchetype: <NewJobArchetype>   // new optional field
projectType: BUILD | TRADE        // mobile storage
workType: <default for archetype> // e.g. SERVICE for inspection TRADE
jobWorkflowKind: SERVICE?         // when service_inspection
phase: sales
lifecycleStatus: new_request
salesStatus: draft
quoteStatus: none
// + customer, address, workspace fields
```

### Default `workType` suggestions (product defaults until user picks in wizard)

| Archetype | `projectType` | Suggested `workType` | `jobWorkflowKind` |
|-----------|---------------|----------------------|-------------------|
| `service_inspection` | `TRADE` | `SERVICE` | `SERVICE` |
| `customer_job` | `TRADE` | `INSTALLATION` | — |
| `large_construction_project` | `BUILD` | `NEW_BUILD` | — |
| `own_build` | `BUILD` | `RENOVATION` | — |
| `internal_project` | `TRADE` | `INSTALLATION` | — |

(Defaults can be refined with product — document in code comments.)

### UI

- Keep five-card archetype picker on **Nová zákazka** (already matches mobile `NewJobArchetype`).  
- Badge shows **archetype** label (SK), not raw `BUILD`/`TRADE`, for managers.  
- Optional advanced row: show engine type (“Stavba” / “Obchod”) for power users later.

---

## 9. Plans / subscription alignment

| Web must | Web must not |
|----------|----------------|
| Show **Free**, **Solo**, **Business** in subscription/billing UI | Invent separate “Solo Business” or “Pro plan” SKUs on web checkout |
| Map **Solo** from `personal_pro` / `pro` entitlement / `getBillingStatus` | Treat Solo as the same as Business |
| Map **Business** from org `planCode` + `status` + `businessEnabled` | Use org `TEAM_5` as customer-facing plan name |
| Read `users.subscription`, callable **`getBillingStatus`**, capability inputs | Implement Apple/Google IAP or RevenueCat purchase on web |
| Explain Solo purchase/manage via **mobile app** (App Store / Play) | Block personal workspace or personal jobs without Business |
| Separate **company registration** from Solo upgrade | Write server-only org fields (`status`, `businessEnabled`, seats) from client |

### Capability expectations

| User state | Personal workspace | Team / Business workspace |
|------------|-------------------|---------------------------|
| Free | Baseline personal features; limits | No Business surface |
| Solo (`personal_pro`) | Personal Pro features (`canUsePersonalProFeatures`, etc.) | No team features unless Business org also active |
| Business (active org) | Personal tier still from Solo/Free separately | Team features per role + org licence |

---

## 10. AI / materials / quotes alignment

### AI

- **Now:** Placeholder copy; store `jobArchetype` + engine fields for future `getNewJobArchetypeAiContextHint`-equivalent on web.  
- **Later:** Server/agent uses same hints; manager confirms; no auto-send quote.

### Materials

- **Draft prep:** `projects/{id}/quoteItems` (web).  
- **Execution:** mobile `projects/{id}/materials`.  
- **On convert to active:** plan one-way copy/import from `quoteItems` → `materials` (future task).

### Quotes

- **Defer** mobile parity.  
- **Keep** web `quotes` for Manager workflow; link `projectId`, sync `acceptedQuoteId` on accept.  
- **Do not** show web quotes in mobile app.  
- **Deprecate** in-memory `/estimates` when Firestore quotes cover all office needs.

---

## 11. Risks

| Risk | Impact | Mitigation |
|------|--------|------------|
| Continued archetype-in-`projectType` writes | Mobile engine breaks / mislabels jobs | P0 write fix |
| Web org create without CF | Drift vs `businessEnabled` / `status` | Read-only gating + later CF alignment |
| Managers confuse `quoteItems` vs `materials` | Double entry | SK copy + convert import later |
| Two quote UIs | Data loss / wrong store | Single primary nav + legacy banner |
| Role downgrade on map | Wrong permissions | Read-only mapping; no mass writes |

---

## 12. Next recommended implementation step

**Recommended sequence** (documentation-only order; implement in small PRs):

1. **P0 — Project persistence** (see below) — `jobArchetype` + BUILD/TRADE + `workType`.
2. **P1 — Plan display layer** — single helper `resolveUserPlanLabel()` → Free \| Solo \| Business from `getBillingStatus` + org; update `/subscription`, billing sidebar, i18n; Solo CTA “manage in mobile app”.
3. **P1 — Business gating** — read org `status`, `businessEnabled`, `planCode` on team workspace; do not conflate with Solo.

**P0 project persistence** (single focused PR):

1. Add optional `jobArchetype` on `ProjectDoc` and `createDraftJob` (Firestore additive).  
2. Set `projectType` to `BUILD` or `TRADE` using mobile mapping functions (port logic to `src/lib/workTypes.ts`).  
3. Set default `workType` and `jobWorkflowKind` per archetype.  
4. Update `WorkTypeBadge` to read `jobArchetype` first; fallback for legacy rows still storing archetype in `projectType`.  
5. Update [`staveto-work-types-ai-context.md`](./staveto-work-types-ai-context.md) to describe three-layer model.  
6. No bulk migration; no AI/PDF/email.

**Do not start** Business CF rewiring or shared quotes schema in the same PR — keep scope narrow.

---

*End of web alignment plan.*
