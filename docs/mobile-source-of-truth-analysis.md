# Mobile source-of-truth analysis (Staveto)

**Document purpose:** Record what the Staveto **mobile** app actually implements so Manager Web (`staveto-office`) can align without guessing schemas or inventing parallel models.  
**Status:** Analysis complete — documentation only; no code or schema changes in this task.  
**Last reviewed:** 2026-06-03  

**Mobile repository path analyzed:**  
`c:\Users\Marek\Staveto_Cursor\staveto-app_v2\mobile`  
(Canonical app code under `mobile/src/`; mirrored worktrees such as `mobile-newjob-contact/` exist but are not the primary reference.)

**Related web docs:** [`staveto-work-types-ai-context.md`](./staveto-work-types-ai-context.md), [`staveto-draft-job-quote-flow.md`](./staveto-draft-job-quote-flow.md), [`staveto-manager-feature-inventory.md`](./staveto-manager-feature-inventory.md), [`web-alignment-plan-from-mobile.md`](./web-alignment-plan-from-mobile.md).

---

## 1. Executive summary

The mobile app is the **authoritative product** for Firestore shapes, project classification, Business organizations, and capability gating. Manager Web must **reuse the same collections and enum values**, extend documents **additively** where web-only pre-sales fields are needed, and **not** introduce a parallel `workspaces/` collection.

**Plans (corrected):** Three **product programs** — **Free** (free personal), **Solo** (paid individual via Apple/Google), **Business** (paid company/team). Mobile **store UI** often says **Staveto Pro** for the paid personal tier; capability code uses `personal_pro` and RevenueCat **`pro`** entitlement. **Business** uses org `planCode` packages (`business_starter`, `business_team`, `business_company`) plus server-only org licence fields. Web should show **Free / Solo / Business** labels while mapping to internal codes (see §4.1).

**Projects:** Mobile distinguishes three layers:

1. **Job archetype** (`NewJobArchetype`) — UI/AI context: `service_inspection`, `customer_job`, `large_construction_project`, `own_build`, `internal_project`. Documented as **not persisted in Phase 1**; mapped to storage types via helpers.
2. **Storage `projectType`** — `BUILD` | `TRADE` (active product); legacy values include `MANAGEMENT`, `RESIDENTIAL`, `MAINTENANCE`.
3. **Storage `workType`** — engine-specific: BUILD (`NEW_BUILD`, `RENOVATION`, `INSTALLATION`, `SERVICE`) or TRADE (`INSTALLATION`, `REPAIR`, `RENOVATION`, `DELIVERY`).

**Quotes:** Mobile has **no** top-level Firestore `quotes` collection. Quotes appear as document classification (`"quote"`) and UX copy. Web’s Firestore `quotes` collection is a **Manager-only interim** layer until a shared contract exists.

**Critical web gap:** Web currently writes **archetype strings** into `projects.projectType`. Mobile writes **`BUILD` / `TRADE`** into `projectType` and granular values into `projects.workType`. Alignment must fix this without breaking existing web draft rows (read both; migrate writes gradually).

---

## 2. Mobile repository path analyzed

| Path | Role |
|------|------|
| `mobile/src/` | Canonical TypeScript/React Native application |
| `mobile/docs/` | Product and Firebase design notes |
| `mobile/firestore.rules` | Security rules (org server-only fields, project create constraints) |
| `mobile/.cursor/rules/business-architecture.mdc` | Business vs solo namespace invariants |

Duplicate trees (`mobile-contacts-pr-a/`, etc.) mirror `src/` for branches; prefer **`mobile/src/`** when diffing.

---

## 3. Files inspected

### Plans, capabilities, subscription

| File | Topic |
|------|--------|
| `mobile/src/lib/capabilities.ts` | `PlanType`: `free` \| `personal_pro` \| `business` |
| `mobile/src/services/subscription.ts` | B2C tiers `FREE`, `BASIC`, `PRO`, `ENTERPRISE` on `users/{uid}.subscription` |
| `mobile/src/services/businessPayments.ts` | B2B `planCode`, orders |
| `mobile/src/screens/business/BusinessPlanSelectionScreen.tsx` | Plan selection UI |
| `mobile/docs/capabilities-free-pro-business.md` | Capability matrix |
| `mobile/docs/BILLING_SETUP.md`, `SUBSCRIPTION_CHECKLIST.md` | IAP / billing ops |

### Onboarding and profile

| File | Topic |
|------|--------|
| `mobile/src/screens/OnboardingMvpScreen.tsx` | Solo vs join company, build/trade branch |
| `mobile/src/lib/primaryUsageMode.ts` | `PrimaryUsageMode`: `build` \| `trade` |
| `mobile/src/services/auth.ts` | Profile updates from onboarding |
| `mobile/docs/PROJECT_CREATION_FLOW.md` | Creation flow narrative |

### Organizations and roles

| File | Topic |
|------|--------|
| `mobile/src/services/organizations.ts` | `OrganizationDoc`, `MembershipDoc`, `OrgStatus`, `OrgRole` |
| `mobile/src/services/businessMembers.ts` | Member management |
| `mobile/src/lib/businessRolePermissions.ts` | `BusinessPermissions` |
| `mobile/src/context/BusinessContext.tsx` | `activeBusinessOrgId` (not `AuthContext.orgId`) |
| `mobile/.cursor/rules/business-architecture.mdc` | Solo uid ≠ Business org id |

### Projects, work types, factory

| File | Topic |
|------|--------|
| `mobile/src/lib/projectEnums.ts` | Archetypes, `workType` unions, `JobWorkflowKind`, `CreationMode` |
| `mobile/src/lib/projectTypeModel.ts` | `BUILD`/`TRADE` engine mapping, legacy types |
| `mobile/src/services/projects.ts` | `ProjectDoc` fields |
| `mobile/src/services/projectFactory.ts` | Create payload |
| `mobile/src/components/UnifiedProjectCreationFlow.tsx` | Archetype picker UI |
| `mobile/docs/PROJECT_CLASSIFICATION_WIZARD.md`, `PROJECT_TYPE_MAINTENANCE.md` | Classification docs |

### Materials, AI, documents

| File | Topic |
|------|--------|
| `mobile/src/lib/types.ts` | `ProjectMaterialUsed`, `MaterialSuggestion` |
| `mobile/src/services/projectMaterials.ts` | `projects/{id}/materials` |
| `mobile/src/lib/materialCatalog.ts` | Categories/units |
| `mobile/src/lib/projectEnums.ts` | `getNewJobArchetypeAiContextHint()` |
| `mobile/docs/AI_MATERIAL_SUGGESTIONS_TODO.md` | AI materials roadmap |
| `mobile/src/lib/parsedDocumentTypes.ts` | Document type `"quote"` (not a quotes collection) |

### Firebase paths

| File | Topic |
|------|--------|
| `mobile/src/lib/firestorePaths.ts` | Collection and subcollection paths |
| `mobile/firestore.rules` | Rules for `projects`, `organizations`, `businessOrders` |

---

## 4. Plans / subscription model

### 4.1 Corrected plan naming and billing ownership

Staveto has **three product programs**. They must not be conflated with onboarding routing labels or with mobile’s occasional **“Pro”** marketing copy.

| User-facing (web Manager) | Product meaning | Billing owner | Internal / capability code |
|---------------------------|-----------------|---------------|----------------------------|
| **Free** | Free personal plan; baseline personal features | None (default) | `free` |
| **Solo** | **Paid** individual plan for personal work | **Apple App Store / Google Play** via mobile IAP (**RevenueCat**) | `personal_pro`, `pro` entitlement, profile `subscription.tier` PRO/BASIC/… |
| **Business** | Paid company/team program; organization workspace | B2B registration / orders / server activation (not App Store Solo SKU) | Capability `business` when org active; org `planCode`: `business_starter` \| `business_team` \| `business_company` |

**Mapping (use on web):**

```text
Free     →  PlanType: free
Solo     →  PlanType: personal_pro  (+ RevenueCat / users.subscription / getBillingStatus signals)
Business →  PlanType: business      (+ organizations.planCode + status + businessEnabled)
```

**Rules for Manager Web:**

1. **Solo is a paid personal program** — not “free personal usage only” and not the same as Business.
2. **Solo subscription is purchased and renewed on mobile** (RevenueCat → App Store / Google Play). Web **must not** implement Apple/Google IAP checkout or receipt validation in the browser.
3. Web **reads** entitlement state from existing backend surfaces: `users/{uid}.subscription`, `billingIsPro`, `hasPersonalProEntitlement`, callable **`getBillingStatus`** (`europe-west1`), and capability resolution inputs — same signals as `capabilities.ts`.
4. **Business company registration is separate** from Solo — creating/joining an organization is not a substitute for Solo, and Solo does not unlock full Business surface (`canUseTeamFeatures`, org admin, seats) without an active Business org.
5. A user with **Solo** can manage **personal** jobs (`ownerId` projects) with Pro personal capabilities; they do **not** get full **company workspace** unless Business org is active and membership allows it.
6. A **Business owner** (org `ownerUid`, role `owner`) can create/manage the **organization workspace** subject to org `status`, `businessEnabled`, and seats.
7. Web UI labels: prefer **Free**, **Solo**, **Business** (SK: Free / Solo / Business or localized equivalents). Where mobile strings still say **Staveto Pro**, treat that as **Solo** in Manager copy unless product standardizes globally.
8. Internal code may keep `free`, `personal_pro`, `business` — do not rename Firestore capability enums without a coordinated mobile release.

**Do not treat Solo as Business.** Do not block personal job usage when the user has Solo. Do not require Business for personal workspace.

### Mobile UI vs product naming

| Surface | Typical label | Maps to |
|---------|---------------|---------|
| Subscription / paywall screens | **Staveto Pro**, “Unlock Staveto Pro” | **Solo** (paid personal) |
| Business landing cross-sell | “Staveto Pro uses subscription via App Store / Google Play” | Confirms IAP ownership |
| Capability engine | `personal_pro` | **Solo** |
| RevenueCat | Entitlement id **`pro`** (and product mapping) | **Solo** |
| Business plan picker | Business packages | **Business** (`planCode`) |

### Capability layer (`PlanType`)

```ts
type PlanType = "free" | "personal_pro" | "business";
```

| `PlanType` | User-facing program | How mobile infers it (simplified) |
|------------|---------------------|----------------------------------|
| `free` | Free | Default; no active personal Pro entitlement; free project limits apply |
| `personal_pro` | **Solo** | `userSubscriptionTier` in `pro`/`basic`/`enterprise`/`personal_pro` with `active`/`trial`/`trialing`, and/or `billingIsPro`, `hasPersonalProEntitlement` |
| `business` | **Business** | Active business context: `activeBusinessOrgId` + org `status === "active"` + `businessEnabled` + membership `active` |

See `mobile/src/lib/capabilities.ts` and `mobile/docs/capabilities-free-pro-business.md`.

### B2C personal subscription storage

- `users/{uid}.subscription` — e.g. tier `FREE` \| `BASIC` \| `PRO` \| `ENTERPRISE`, status fields
- RevenueCat sync (mobile) — entitlement **`pro`** drives paid personal access
- Web: **read-only** display and gating; deep link or CTA “Manage subscription in mobile app” where needed

### B2B organization `planCode` (server-set, Business only)

| `planCode` | Package tier (Business) |
|------------|-------------------------|
| `business_starter` | Starter |
| `business_team` | Team |
| `business_company` | Company |

Optional UI reference: `business_enterprise` (display).  
`planCode` is **not** used for Free or Solo — those are individual capability tiers, not org SKUs.

### Onboarding path vs paid Solo (disambiguation)

| Term in code/docs | Meaning |
|-------------------|---------|
| Onboarding branch **`solo`** / `join_company` | **Usage path**: personal setup vs join/create company — **not** a billable SKU |
| Product **Solo** | **Paid personal plan** (maps to `personal_pro`) |

A user can complete onboarding on the **personal** path while on **Free**, then upgrade to **Solo** via mobile IAP later.

---

## 5. User profile / onboarding model

- **Pending onboarding:** AsyncStorage `pending_onboarding`; gates navigation until complete.
- **Branch:** `join_company` vs **solo** — **usage path** (personal vs company), distinct from **Solo paid plan**.
- **Personal onboarding path:** primary usage `build` \| `trade` → country → identity → optional first project / equipment.
- **`PrimaryUsageMode`:** persisted (`primary_usage_mode_v1`) — influences product defaults, **not** billing tier.
- **Legacy screens:** `OnboardingScreen`, intro/evolution variants still in tree.

Web onboarding should map **personal usage path** → personal workspace (`ownerId` projects), **company path** → organization workspace — and use **Free / Solo / Business** only for **subscription/capability** messaging, not for step 3 routing labels alone.

---

## 6. Company / organization / workspace model

### Collections

```
organizations/{orgId}
organizations/{orgId}/members/{memberId}
organizations/{orgId}/contacts/...
organizations/{orgId}/chats/...
businessOrders/{orderId}
invites/...
```

**No** `workspaces/{id}` top-level collection on mobile.

### `organizations/{orgId}` — key fields

| Field | Client writable? | Notes |
|-------|------------------|-------|
| `name`, `profile` | Owner/admin | Company display + legal profile |
| `ownerUid` | Immutable | Creator UID |
| `billingEmail` | Optional | |
| `status` | **Server only** | See `OrgStatus` |
| `businessEnabled` | **Server only** | Master Business switch |
| `seatsLimit`, `seatsUsed` | **Server only** | Licence seats |
| `planCode`, `billingPeriod` | **Server only** | B2B SKU |
| `trialStartedAt`, `trialEndsAt` | Optional | |
| `activeBusinessOrderId` | Links `businessOrders` | |
| `businessActivatedAt`, `businessActivatedBy` | **Server only** | Audit |

### `OrgStatus`

`trialing` \| `pending_payment` \| `active` \| `past_due` \| `suspended` \| `cancelled`

### Workspace on projects (team jobs)

- `projects.orgId`
- `projects.workspaceType`: `"team"` / `"business"` (team context)
- Personal jobs: `ownerId` = auth uid

### Invariant

`AuthContext.orgId` for B2C equals **solo user uid** — must **not** be repurposed as Business org id. Business uses `BusinessContext.activeBusinessOrgId`.

---

## 7. Roles and permissions

### Organization roles (`OrgRole`)

`owner` \| `admin` \| `manager` \| `worker` \| `viewer`  
Legacy `"member"` normalised to `"viewer"`.

### Membership status

`invited` \| `pending` \| `active` \| `suspended` \| `removed` — only **active** counts toward `seatsUsed`.

### Optional granular permissions

`BusinessPermissions` partial on membership (`businessRolePermissions.ts`).

### Project-level share role (B2C)

`ProjectMember.role` fixed `"MEMBER"` — **distinct** from org roles.

### Web today (contrast)

Web members UI largely maps `admin` \| `member` on invites — **narrower** than mobile Business roles. Alignment should expand toward mobile role set without breaking existing member docs.

---

## 8. Project / job model

### `projects/{projectId}` — core fields (mobile)

| Field | Purpose |
|-------|---------|
| `ownerId` | Personal owner |
| `name`, `createdAt`, `updatedAt` | Core |
| `projectType` | **`BUILD` \| `TRADE`** (storage) |
| `workType` | Granular BUILD/TRADE subtype |
| `templateId` | Catalog template |
| `jobsTabVisible` | List/tab visibility |
| `jobWorkflowKind` | `STANDARD` \| `SERVICE` |
| `serviceMaintenanceScope` | `PROPERTY` \| `EQUIPMENT` when service workflow |
| `businessMode` | `DIRECT` \| `SUBCONTRACT` \| `INTERNAL` |
| `creationMode` | `AI` \| `MANUAL` \| `TEMPLATE` \| `CLONE` |
| `referenceNumber` | User job number |
| `orgId`, `workspaceType`, `assignedMemberIds` | Team projects |
| `addressText`, `city`, `countryCode` | Location |
| `archivedAt`, `isTemplate` | Lifecycle/list |
| Cover image fields | UI |
| `sharedWithCount`, `isSharedToMe` | Denormalised |

### Subcollections (mobile)

`phases`, `tasks`, `members`, `expenses`, `attachments`, `documents`, `materials`, `materialSuggestions`, `constructionDiary`, `events`, `problems`, `equipment`, `serviceRules`, etc.

### Web-only additive fields (draft zákazka — already on some web docs)

`phase`, `lifecycleStatus`, `salesStatus`, `quoteStatus`, `customerRequest`, `customerName`, customer contact, `source`, `convertedAt`, `acceptedQuoteId`, `quoteDraftVatPercent`, `quoteDraftNotes`, `projects/{id}/quoteItems` — mobile may ignore until supported.

---

## 9. Exact work / project type enum values

### A) `NewJobArchetype` (UI / AI — mobile Phase 1)

| Value | SK (product) |
|-------|----------------|
| `service_inspection` | Servis / obhliadka |
| `customer_job` | Zákazka pre klienta |
| `large_construction_project` | Veľký stavebný projekt |
| `own_build` | Vlastná stavba |
| `internal_project` | Interný projekt |

Mobile comment: **“not persisted until later phases”** — passed to AI via hints.

### B) Storage `projectType` (Firestore)

**Active:** `BUILD`, `TRADE`  
**Legacy read:** `MANAGEMENT`, `RESIDENTIAL`, `MAINTENANCE`, …

### C) Storage `workType` (Firestore)

**BUILD:** `NEW_BUILD`, `RENOVATION`, `INSTALLATION`, `SERVICE`  
**TRADE:** `INSTALLATION`, `REPAIR`, `RENOVATION`, `DELIVERY`  
**Legacy maintenance wizard:** `FLEET`, `MACHINERY`, `PROPERTY`, `EQUIPMENT`

### Archetype → storage mapping (mobile helpers)

| Archetype | `projectType` | `jobWorkflowKind` |
|-----------|---------------|-------------------|
| `large_construction_project`, `own_build` | `BUILD` | — |
| `service_inspection` | `TRADE` | `SERVICE` |
| `customer_job`, `internal_project` | `TRADE` | — |

---

## 10. Work type settings / enabled types logic

- Wizard shows **engine-appropriate** `workType` lists (`WORK_TYPES_BUILD`, `WORK_TYPES_TRADE`).
- `PrimaryUsageMode` (`build` \| `trade`) from onboarding biases default engine.
- **Enabled types** are not a separate Firestore “settings” document in the inspected code — they are **derived from engine + wizard step**, plus product capabilities (`capabilities.ts`).
- Business gating: org must be `active` + `businessEnabled` for team features.

Web should not invent a global “enabled work types” collection without mobile parity.

---

## 11. AI behavior related to work types

- **Not a single chat agent** — creation flows use `CreationMode: "AI"` and archetype-specific copy.
- `getNewJobArchetypeAiContextHint(archetype)` appends structured hints to AI `projectDetails` (no schema change).
- **Per archetype intent:**
  - `service_inspection` — compact checklist, diagnostics, safety
  - `customer_job` — quoting structure, client communication
  - `large_construction_project` — phased construction
  - `own_build` — homeowner-friendly phases
  - `internal_project` — internal tasks, no sales language
- **Materials AI:** `materialSuggestions` subcollection; see `AI_MATERIAL_SUGGESTIONS_TODO.md`.
- **Rule:** AI prepares drafts; user confirms before create/send.

Web: placeholders only; preserve archetype (or mapped fields) for future prompts.

---

## 12. Materials and quote item model

### Materials (mobile)

- Types: `ProjectMaterialUsed`, `MaterialSuggestion` in `types.ts`
- Paths: `projects/{id}/materials`, `projects/{id}/materialSuggestions`
- Catalog: `materialCatalog.ts` (categories, units)

### Quote line items (mobile)

No first-class **quote document** with line items in Firestore. Pricing/offer language lives in **customer_job** UX and **document type `quote`** for uploaded files.

### Web (interim)

- `projects/{id}/quoteItems` — draft prep lines (`material` \| `work` categories)
- Top-level `quotes/{id}` with embedded `items[]` — **Manager-only** until mobile contract exists

---

## 13. Quotes / estimates model

| Layer | Mobile | Web (staveto-office) |
|-------|--------|----------------------|
| Firestore `quotes` | **None** | `quotes` collection (Manager MVP) |
| Offer UX | Job + documents + AI | Draft zákazka + `quotes` + legacy `/api/estimates` (in-memory) |
| PDF / email | Not in inspected MVP paths | Explicitly deferred on web |

**Defer** treating web `quotes` as mobile truth until shared schema and rules are agreed.

---

## 14. Firebase collections and fields (summary)

### Top-level (shared)

`users`, `projects`, `organizations`, `businessOrders`, `invites`, `catalogTemplates`, `timeEntries`, `config`, …

### Web-added usage (additive, non-breaking if mobile ignores)

`quotes`, `projects/*/quoteItems`, extra optional fields on `projects` for sales lifecycle

### Project create (rules pattern — mobile)

Personal create: `ownerId == auth.uid`. Team: `orgId` + membership. Clients cannot write server-only org fields.

---

## 15. Mobile vs current web comparison

| Area | Mobile | Web (Manager) | Alignment |
|------|--------|---------------|-----------|
| Workspace | `ownerId` / `orgId` on projects | Same + UI “personal” / “team” bridge | OK |
| `workspaces/` collection | None | None | OK |
| Org owner field | `ownerUid` | `ownerUid` | OK |
| Org roles | 5 roles + permissions | `admin` / `member` | **Gap** |
| Org billing | `planCode`, `businessEnabled`, `status` | `plan`: `TEAM_5` etc. | **Gap** |
| Plan naming | Free + Pro (IAP) + Business; `personal_pro` in code | Should use Free/Solo/Business in UI | **Gap** (copy; map Pro→Solo) |
| Solo IAP on web | RevenueCat / App Store / Play | Must not sell Solo on web | **By design** (read-only) |
| `projectType` on create | `BUILD` / `TRADE` | Archetype strings (web draft) | **Critical gap** |
| `workType` on create | `NEW_BUILD`, … | Often unset on web drafts | **Gap** |
| `jobWorkflowKind` | Set for service archetype | Not set on web | **Gap** |
| Sales lifecycle fields | Not in mobile MVP | `phase`, `lifecycleStatus`, … | Web-only additive OK |
| Quotes | None | Firestore `quotes` | Interim web-only |
| Materials | `materials` subcollection | `quoteItems` subcollection | Different purpose; both OK additive |
| AI | Archetype hints in create | Placeholder panels | Web defer OK |

---

## 16. Gaps in the current web app

1. **`projectType` semantics** — Web stores `NewJobArchetype` values; mobile stores `BUILD`/`TRADE`. Risk: mobile reads web drafts as unknown `projectType`.
2. **Missing `workType`, `jobWorkflowKind`, `creationMode`** on web create — mobile wizard metadata absent.
3. **Organization model** — Web `TEAM_*` legacy org `plan` vs mobile `planCode` + server-only gating fields not fully mirrored in UI/services.
4. **Plan copy** — Web must adopt **Solo** label for `personal_pro` / Pro entitlement; must not describe Solo as “usage mode only” or conflate with Business.
5. **Roles** — Web invite/admin binary vs mobile five roles.
6. **Business activation** — Web does not surface `businessEnabled`, `status`, `seatsLimit` the way Business dashboard does on mobile.
7. **Subscription UX** — Web `/subscription` and billing pages must read entitlement via `getBillingStatus` / profile; must not implement store checkout.
8. **Quotes** — Web Firestore quotes not in mobile; dual legacy `/estimates` path causes confusion.
9. **Materials** — Web `quoteItems` ≠ mobile `materials`; naming overlap for managers.
10. **Documentation drift** — [`staveto-work-types-ai-context.md`](./staveto-work-types-ai-context.md) describes archetypes in `projectType`; must be updated when write path aligns to mobile storage model.

---

## 17. Recommended web implementation plan

1. **Fix project type persistence (highest priority)**  
   - On draft create: persist `jobArchetype` (new optional field) **or** reuse a dedicated field name agreed with mobile.  
   - Map to `projectType: BUILD|TRADE`, set `workType`, `jobWorkflowKind` per mobile helpers.  
   - Keep reading legacy web rows that only have archetype in `projectType`.

2. **Align plan & billing UX**  
   - Display **Free / Solo / Business**; map from `getBillingStatus` + org state.  
   - Solo: read-only on web; CTA to mobile for purchase/manage.  
   - Business: separate registration; never label org `planCode` as “Solo”.  
3. **Align organization services**  
   - Read `status`, `businessEnabled`, `planCode`, seats fields; stop inventing parallel `TEAM_*` enums as customer-facing plan names.  
   - Company creation flows call same CF patterns as mobile Business registration (when web exposes them).

4. **Expand roles gradually**  
   - Display mobile roles on members page; map legacy `admin`/`member` on read.

5. **Quotes**  
   - Keep Firestore `quotes` as Manager draft; label as internal until mobile schema exists; do not sync to mobile app lists.

6. **AI**  
   - Store archetype + `projectType`/`workType` for prompts; UI placeholders until agent pipeline exists.

7. **Materials**  
   - Keep `quoteItems` for pre-quote; plan merge/import into mobile `materials` when executing jobs.

See [`web-alignment-plan-from-mobile.md`](./web-alignment-plan-from-mobile.md) for phased steps.

---

## 18. Risks and compatibility notes

| Risk | Mitigation |
|------|------------|
| Mobile lists show web drafts with wrong `projectType` | Dual-read; filter `phase === 'sales'` on mobile when supported |
| Overwriting `projectType` breaks mobile project engine | Never write archetype strings into `projectType` after alignment |
| Client writes to server-only org fields | Rules reject; web read-only for `status`, `businessEnabled`, seats |
| Two quote systems on web | Banner on `/estimates`; primary nav → `/app/quotes` |
| Index explosion | Reuse mobile index patterns (`ownerId`/`orgId` + `updatedAt`) |

**Additive-only** changes on `projects` and `organizations` remain safe if mobile ignores unknown fields.

---

## 19. Open questions

1. **When will mobile persist `NewJobArchetype`?** Field name: `jobArchetype`, `creationArchetype`, or other?  
2. **Should web retroactively migrate** archetype-in-`projectType` documents or only fix forward writes?  
3. **Shared Firestore `quotes` schema** — owner, status enum, line item shape, link to `projects.acceptedQuoteId`.  
4. **Web Business registration** — which Cloud Functions are canonical for org provision vs web `createOrganization`?  
5. **Team project list filters** — does mobile hide `phase: sales` drafts globally?  
6. **`business_enterprise` planCode** — display-only or upcoming SKU?  
7. **Global rename** — will mobile UI standardize on “Solo” instead of “Staveto Pro” in all locales?  
8. **Web Solo upgrade** — deep link to app store vs status-only banner until user subscribes on phone?  
9. **Stripe** — any non-IAP `personal_pro` path on web for certain regions, or RevenueCat-only?  
10. **Import path** from `quoteItems` → `materials` on convert to active job.

---

*End of mobile source-of-truth analysis.*
