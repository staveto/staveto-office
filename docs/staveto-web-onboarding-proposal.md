# Staveto Web — Onboarding Redesign Proposal

**Version:** 1.0  
**Date:** 2026-06-02  
**Status:** Proposal only — **no implementation in this document**  
**Scope:** Align web onboarding with mobile profile-creation principle (mobile repo not in workspace)

---

## Evidence legend

| Tag | Meaning |
|-----|---------|
| **Verified** | Confirmed in `staveto-office` source |
| **Inferred** | Suggested by types, partial fields, or product direction; not confirmed against mobile code |
| **Blocked** | Requires mobile app repository or Firestore export |
| **Planned** | Target design for a future implementation phase |

---

## 1. Current web onboarding analysis

### Entry and gating

| Piece | Behavior | Evidence |
|-------|----------|----------|
| Register | Email/password + optional `displayName`; Google sign-up → redirect `?next` (default `/app`) | **Verified** — `src/app/register/page.tsx` |
| Login | Same pattern | **Verified** — `src/app/login/page.tsx` |
| Profile bootstrap | `ensureUserProfile` on first auth: `email`, `emailLower`, `displayName` only | **Verified** — `src/lib/userProfile.ts`, `AuthContext` |
| Onboarding gate | `AuthGuard` redirects authenticated users to `/onboarding` if `users.onboarding.completed !== true` | **Verified** — `src/components/layout/AuthGuard.tsx` |
| Join invite | Accept invite → `completeOnboarding()` immediately → `/app` (skips wizard) | **Verified** — `src/app/join/page.tsx` |
| Layout | Onboarding excluded from `AppLayout` / `WorkspaceProvider` shell | **Verified** — `ConditionalAppLayout.tsx` |

### Current wizard (`/onboarding`)

**File:** `src/app/(app)/onboarding/page.tsx`  
**Steps today (5):**

| Step | UI title (EN) | Collects | Persists |
|------|---------------|----------|----------|
| 1 | What brings you here? | `purpose`: work \| personal \| school \| nonprofits | `users.onboarding.purpose` |
| 2 | What best describes your current role? | `role`: craftsman \| manager \| accountant \| other | `users.onboarding.role` |
| 3 | How many people are on your team? | `teamSize`: only_me … 101_500 | `users.onboarding.teamSize` |
| 4 | Who else is on your team? | Invite rows (email + admin/member) | `users.onboarding.inviteEmails` |
| 5 | You're all set! | Finish → `completeOnboarding()` | `onboarding.completed`, `onboarding.completedAt` |

**Side effects on step 4 (Verified):**

- If `teamSize !== "only_me"` **and** at least one invite email → `getOrCreateUserOrg()` creates **"My Team"** org + sends invites + shows copy link.
- If `only_me` or no invites → **no org created** during onboarding; only profile flags updated on finish.

**Not collected today (Verified gaps):**

- Root `users.firstName` / `users.lastName` (types exist; wizard does not ask).
- `phoneNumber`, `language`, `country` (not in `UserProfile` type).
- Explicit **Personal vs Company** usage choice (step 1 is generic “purpose”, not workspace type).
- `usageType`, `activeWorkspaceId`, `activeWorkspaceType`, `onboarding.source`.
- `selectedFeatures` / feature interests.
- Company name when creating org (org name hardcoded `"My Team"` in `getOrCreateUserOrg`).
- Join-existing-company path inside onboarding (only via `/join?token=` externally).

### User profile service

**File:** `src/lib/userProfile.ts`

```typescript
// Verified shape today
users/{uid}: {
  displayName?, email?, emailLower?,
  firstName?, lastName?,        // root — rarely set by web onboarding
  createdAt?, updatedAt?,
  onboarding?: {
    purpose?, role?, teamSize?,
    inviteEmails?: { email, role }[],
    completed?, completedAt?
  }
}
```

`completeOnboarding()` merges `completed: true` and `completedAt` only — does not set `source`, workspace selection, or sync `displayName` from first/last name.

### Workspace after onboarding

**Verified:** `WorkspaceContext` loads personal + org memberships after user reaches `/app`. No onboarding write to `sessionStorage` / `staveto.activeWorkspaceId` during wizard. Personal users with `only_me` land on personal workspace by default. Users with created org see team workspace in switcher once memberships load.

### i18n

Onboarding copy is **hardcoded in English** in `onboarding/page.tsx`. App shell uses `src/i18n/translations.ts` (default locale **sk**). **Verified** inconsistency.

---

## 2. Mobile onboarding comparison status

| Item | Status |
|------|--------|
| Mobile app repository in workspace | **Blocked** — not present under `staveto-app_v2` |
| Mobile onboarding screens / services | **Blocked** |
| Mobile field names | **Blocked** |
| Mobile step order | **Blocked** |

### Inferred from web/mobile-shared signals (do not treat as confirmed)

| Signal | Inference |
|--------|------------|
| `users.firstName` / `lastName` on root doc | Mobile likely sets root profile names — **Inferred** |
| `users.onboarding.role` values craftsman/manager/accountant | May align with mobile profession — **Inferred** |
| `organizations` + `invites` | Mobile and web share team model — **Verified** for web |
| Paywall / subscription copy mentions mobile | Field workers use mobile; managers use web — **Verified** marketing only |

**Action when mobile repo is available:** Export mobile onboarding module map (screens → Firestore writes) and replace §2 and §6 with a diff table.

---

## 3. Existing user profile fields found

### `users/{uid}` (Verified in `userProfile.ts` + `AuthContext`)

| Field | Set by web today? | Notes |
|-------|-------------------|-------|
| `email` / `emailLower` | Register / ensure | |
| `displayName` | Register / Google | Not derived from first+last in onboarding |
| `firstName` | **Rarely** | Read in AuthContext if present |
| `lastName` | **Rarely** | Read in AuthContext if present |
| `onboarding.purpose` | Onboarding step 1 | Not same as `usageType` |
| `onboarding.role` | Onboarding step 2 | Profession-like |
| `onboarding.teamSize` | Onboarding step 3 | Company size proxy |
| `onboarding.inviteEmails` | Onboarding step 4 | |
| `onboarding.completed` | Finish / join | Gate |
| `onboarding.completedAt` | Finish / join | |

### Not found in web types (Blocked for mobile parity)

| Field | Status |
|-------|--------|
| `phoneNumber` | **Blocked** — not in `UserProfile` |
| `language` | **Blocked** — not in `UserProfile` (app has UI locale only) |
| `country` | **Blocked** |
| `usageType` | **Planned** |
| `onboarding.source` | **Planned** |
| `selectedFeatures` | **Planned** |
| `activeWorkspaceId` / `activeWorkspaceType` | **Planned** (session + optional profile) |

### `organizations/{orgId}` (Verified)

| Field | Web onboarding |
|-------|----------------|
| `name` | Default `"My Team"` via `getOrCreateUserOrg` — not user-entered |
| `ownerUid`, `plan`, `seatLimit`, `createdAt` | Auto |
| `slug`, `domain`, `subdomainEnabled` | Separate settings UI — not onboarding |
| `onboardingSource` | **Planned** additive field |

---

## 4. Proposed onboarding flow (target)

Aligns with product brief and shared profile principle without breaking existing data.

```mermaid
flowchart TD
  A[Account created Auth] --> B[Step 1 Welcome]
  B --> C[Step 2 Personal profile]
  C --> D[Step 3 Usage type]
  D -->|Personal| E[4A Personal confirm]
  D -->|Company| F[4B Company branch]
  F --> G[Create company]
  F --> H[Join with invite]
  G --> I[Step 5 Feature interests optional]
  H --> I
  E --> J[Step 6 Complete]
  I --> J
  J --> K{usageType}
  K -->|personal| L[/app personal workspace]
  K -->|company| M[/app company workspace]
```

### Step 1 — Welcome

**Purpose:** Explain Staveto; set expectations.  
**Does not write Firestore** (or only `onboarding.step = 1` optional).

### Step 2 — Personal profile

**Purpose:** Create consistent **personal** identity on `users/{uid}`.

| Field | Storage | Mobile name |
|-------|---------|-------------|
| firstName | `users.firstName` | **Blocked** — use root field |
| lastName | `users.lastName` | **Blocked** |
| phoneNumber | `users.phoneNumber` | **Blocked** — add only if mobile confirms |
| language | `users.language` or `onboarding.language` | **Blocked** — default from `I18nProvider` until confirmed |
| country | `users.country` or `onboarding.country` | **Blocked** |
| profession | `onboarding.role` (existing) | **Verified** web already uses craftsman/manager/accountant/other |

Also set `displayName = trim(firstName + " " + lastName)` when both present (**Verified** pattern in org member display).

### Step 3 — Usage type

**Purpose:** Personal workspace vs Company/Team workspace — maps to **where projects live**, not to billing tier.

| Choice | `usageType` (new, optional) | Workspace |
|--------|----------------------------|-----------|
| Personal (label may say “Personal / Solo” in UI) | `personal` | Personal (`ownerId` projects) |
| Company / Team | `company` | `organizations/{orgId}` |

**Important — plan naming (corrected):**

| Term | Meaning |
|------|---------|
| Step 3 **personal** path | Onboarding **usage path** — not the same as subscribing to the **Solo** paid plan |
| **Solo** (product) | **Paid personal plan** (`personal_pro` / RevenueCat `pro` on mobile) — user may be Free or Solo **after** onboarding |
| **Business** (product) | Paid **company** program — separate registration; `planCode` on org; not chosen in step 3 alone |

Web onboarding must **not** imply that choosing “personal” in step 3 buys Solo, or that “company” replaces Solo. Copy should say users can use Staveto **Free** on personal workspace and upgrade to **Solo** via the mobile app (App Store / Google Play). **Business** is a separate company setup path.

Deprecate overloading step-1 `purpose` (work/school/nonprofits) for workspace routing — keep `purpose` as optional analytics field or drop from new flow.

### Step 4A — Personal setup

- Confirm personal workspace (no org required).
- Do **not** call `getOrCreateUserOrg` unless product explicitly wants a hidden team org for solo users (**current web does not** — preserve).
- Optional: skip step 5 or show shortened interests.

### Step 4B — Company setup

**Branch A — Create new company**

| Field | Storage |
|-------|---------|
| companyName | `organizations.name` (user input, not `"My Team"`) |
| companySize | `onboarding.teamSize` (reuse) or `organizations.teamSize` **Blocked** |
| companyType | **Blocked** — document only |
| country | **Blocked** |

Use `createOrganization(ownerUid, companyName, plan)` instead of `getOrCreateUserOrg` when user already has zero orgs.

**Branch B — Join existing**

- Input: invite token or link paste → redirect `/join?token=...` (reuse **Verified** flow).
- Do not duplicate `acceptInvite` logic.

### Step 5 — Feature interests (optional)

Multi-select; store only if model agreed:

```typescript
onboarding.selectedFeatures?: (
  | "quotes" | "projects" | "attendance" | "expenses"
  | "documents" | "team" | "calendar" | "invoices"
)[]
```

If mobile has no equivalent → store under `onboarding.selectedFeatures` web-only until mobile confirms (**Planned**).

### Step 6 — Completion

Atomic write (via service):

```typescript
users/{uid}: {
  firstName, lastName, displayName, phoneNumber?, language?, country?,
  onboarding: {
    role, teamSize?, inviteEmails?,
    usageType: "personal" | "company",
    selectedFeatures?,
    completed: true,
    completedAt,
    source: "web",
    activeWorkspaceId,      // "personal" | orgId
    activeWorkspaceType,    // "personal" | "company"
  }
}
```

Call `persistActiveWorkspaceId(activeWorkspaceId)` (**Verified** — `workspaceService`).

**Redirect:**

| usageType | Route |
|-----------|-------|
| personal | `/app` |
| company | `/app` (optionally `/app/projects` if product prefers) |

### Returning mobile users (Planned)

If `onboarding.completed === true` from mobile (**Blocked** field parity):

- Web `AuthGuard` already skips onboarding — **Verified**.
- Optional: “Complete your web profile” banner if `onboarding.source !== "web"` and names missing — **Planned**.

---

## 5. Firestore fields to reuse

| Field | Reuse |
|-------|-------|
| `users.firstName`, `users.lastName` | Yes — populate in step 2 |
| `users.displayName` | Yes — derived |
| `users.onboarding.role` | Yes — profession step |
| `users.onboarding.teamSize` | Yes — company size |
| `users.onboarding.inviteEmails` | Yes — company invite step |
| `users.onboarding.completed` / `completedAt` | Yes — gate unchanged |
| `organizations` + `invites` | Yes — existing services |
| `organizations.name` | Yes — user-provided company name |

---

## 6. Firestore fields that may be missing

| Field | Recommendation | Risk if added |
|-------|----------------|---------------|
| `users.phoneNumber` | Add optional root field | Low — mobile may already use |
| `users.language` | Add optional (`sk` \| `en`) | Low |
| `users.country` | Add optional ISO code | Low |
| `onboarding.usageType` | Add inside `onboarding` map | Low — merge write |
| `onboarding.source` | `"web"` \| `"mobile"` | Low |
| `onboarding.selectedFeatures` | string array | Low |
| `onboarding.activeWorkspaceId` | string | Low |
| `onboarding.activeWorkspaceType` | `personal` \| `company` | Low |
| `organizations.onboardingSource` | `"web"` on create | Low |
| `companyType` | **Blocked** — wait for mobile | — |

**No migration:** all additive merges via `setDoc(..., { merge: true })`.

---

## 7. Compatibility risks

| Risk | Mitigation |
|------|------------|
| Existing users mid-onboarding (`completed` false, partial `onboarding`) | New wizard reads existing partial data; map old `purpose` only for display, not routing |
| Join flow skips profile steps | After join, set names if missing; or mark `onboarding.profileSkipped` — **Planned** |
| `getOrCreateUserOrg` creates duplicate org | Use `getUserOrgMemberships` first; only `createOrganization` when user chooses create company |
| Personal-path users forced into team questions | Step 3 branches; hide team size/invites for `usageType: personal` (not the same as Solo paid plan) |
| English-only onboarding vs SK app | Move all copy to `translations.ts` |
| AuthGuard + register race | Register should redirect to `/onboarding` not `/app` when incomplete — **Planned** fix |
| Mobile reads unknown `onboarding` keys | Only add optional keys; never rename/remove existing |
| Duplicate name storage | Single source: root `firstName`/`lastName`; `displayName` computed |

---

## 8. Recommended implementation plan

### Phase A — Documentation & mobile verification (now)

- [x] This proposal
- [ ] Add mobile repo; fill §2 and §10 verification checklist

### Phase B — Service layer (safe, no UI)

| Task | File |
|------|------|
| Extend `UserProfile` type | `src/lib/userProfile.ts` |
| `onboardingService.ts`: step saves, `finishOnboarding`, map usageType → workspace | `src/services/onboarding/onboardingService.ts` |
| Extend `completeOnboarding` to accept payload (source, workspace, features) | `userProfile.ts` or service only |

### Phase C — UI redesign (after approval)

| Task | File |
|------|------|
| Replace wizard steps 1–6 | `src/app/(app)/onboarding/page.tsx` |
| Extract step components | `src/components/onboarding/*` |
| i18n keys `onboarding.*` | `src/i18n/translations.ts` |
| Register redirect → `/onboarding` when incomplete | `register/page.tsx` |
| Preserve `/join` behavior; optional pre-step profile | `join/page.tsx` |

### Phase D — Post-onboarding (optional)

- Set `WorkspaceContext` initial workspace from `onboarding.activeWorkspaceId`
- Dashboard hint from `selectedFeatures`

**Do not implement in Phase B/C:** subdomains, calendar, invoices, AI, new collections.

### Is implementation safe now?

| Area | Safe? |
|------|-------|
| Extend types + merge writes | Yes |
| New onboarding UI behind same route | Yes |
| Keep `onboarding.completed` gate | Yes |
| Company create with real name | Yes — use existing `createOrganization` |
| phone/country without mobile confirm | **Defer** or add as optional-only |

**Recommendation:** Approve proposal → implement Phase B + C. Defer `phoneNumber` / `country` until mobile schema confirmed.

---

## 9. UI copy — Slovak (SK)

### Step 1 — Welcome

- **Title:** Vitajte v Staveto  
- **Body:** Najprv nastavíme váš profil a pracovný priestor.  
- **Primary:** Pokračovať  

### Step 2 — Personal profile

- **Title:** Váš profil  
- **Subtitle:** Tieto údaje budú rovnaké vo webovej aj mobilnej aplikácii.  
- **Labels:** Meno, Priezvisko, Telefón (voliteľné), Jazyk, Krajina, Vaša rola  
- **Roles:** Remeselník, Majster / Vedúci, Účtovník, Iné  
- **Primary:** Pokračovať  
- **Back:** Späť  

### Step 3 — Usage type

- **Title:** Ako chcete používať Staveto?  
- **Option 1 title:** Osobne / Živnosť  
- **Option 1 desc:** Pre živnostníkov, remeselníkov a individuálnych používateľov.  
- **Option 2 title:** Firma / Tím  
- **Option 2 desc:** Pre stavebné firmy, majstrov a zamestnancov.  
- **Primary:** Pokračovať  

### Step 4A — Personal

- **Title:** Osobný pracovný priestor  
- **Body:** Projekty a údaje budú uložené pod vaším osobným účtom. Neskôr môžete pridať firmu alebo tím.  
- **Primary:** Dokončiť nastavenie  

### Step 4B — Create company

- **Title:** Nová firma  
- **Labels:** Názov firmy, Veľkosť tímu  
- **Primary:** Pokračovať  

### Step 4B — Join company

- **Title:** Pripojiť sa k firme  
- **Body:** Máte pozvánku? Otvorte odkaz z e-mailu alebo vložte token pozvánky.  
- **Primary:** Otvoriť pozvánku  
- **Link:** Mám už účet — prihlásiť sa  

### Step 4B — Invites (if creating)

- **Title:** Pozvite tím (voliteľné)  
- **Primary:** Pokračovať  

### Step 5 — Features

- **Title:** Čo chcete používať najčastejšie?  
- **Subtitle:** Môžete zmeniť neskôr.  
- **Options:** Cenové ponuky, Projekty, Dochádzka, Výdavky, Dokumenty, Tím, Kalendár, Faktúry  
- **Primary:** Pokračovať  

### Step 6 — Complete

- **Title:** Hotovo!  
- **Body:** Váš profil je pripravený.  
- **Primary:** Prejsť do aplikácie  

### Errors

- **Required field:** Toto pole je povinné.  
- **Invalid phone:** Zadajte platné telefónne číslo.  
- **Save failed:** Nepodarilo sa uložiť. Skúste znova.  

---

## 10. UI copy — English (EN)

### Step 1 — Welcome

- **Title:** Welcome to Staveto  
- **Body:** First we’ll set up your profile and workspace.  
- **Primary:** Continue  

### Step 2 — Personal profile

- **Title:** Your profile  
- **Subtitle:** This information stays in sync across web and mobile.  
- **Labels:** First name, Last name, Phone (optional), Language, Country, Your role  
- **Roles:** Craftsman, Manager, Accountant, Other  
- **Primary:** Continue  
- **Back:** Back  

### Step 3 — Usage type

- **Title:** How do you want to use Staveto?  
- **Option 1 title:** Personal workspace (avoid implying paid Solo here)  
- **Option 1 desc:** For self-employed workers and individual users. You can start on Free and upgrade to Solo in the mobile app later.  
- **Option 2 title:** Company / Team  
- **Option 2 desc:** For construction companies — Business registration and team workspace (separate from Solo personal plan).  
- **Primary:** Continue  

### Step 4A — Personal

- **Title:** Personal workspace  
- **Body:** Your projects will live under your personal account. You can add a company later.  
- **Primary:** Finish setup  

### Step 4B — Create company

- **Title:** New company  
- **Labels:** Company name, Team size  
- **Primary:** Continue  

### Step 4B — Join company

- **Title:** Join a company  
- **Body:** Have an invite? Open the link from your email or paste your invite token.  
- **Primary:** Open invite  
- **Link:** I already have an account — sign in  

### Step 5 — Features

- **Title:** What will you use most?  
- **Subtitle:** You can change this later.  
- **Options:** Quotes, Projects, Attendance, Expenses, Documents, Team, Calendar, Invoices  
- **Primary:** Continue  

### Step 6 — Complete

- **Title:** You’re all set!  
- **Body:** Your profile is ready.  
- **Primary:** Go to app  

---

## 11. Verify when mobile repo is available

| # | Question | Mobile artifact to locate |
|---|----------|---------------------------|
| 1 | Exact onboarding step order? | Onboarding navigator / routes |
| 2 | Root profile fields written on complete? | `users` repository / model |
| 3 | Is `phoneNumber` required or optional? | Validation rules |
| 4 | `language` / `country` field names and enums? | i18n / profile DTO |
| 5 | How is personal vs company expressed? | `usageType` or equivalent |
| 6 | Company creation fields (name, size, type)? | Org create screen |
| 7 | Does mobile set `onboarding.completed` same path? | Auth bootstrap |
| 8 | Feature interests stored? | Profile or onboarding flags |
| 9 | Can mobile user skip company if solo? | Branch logic |
| 10 | Join invite UX — token only or email lookup? | Invite flow |
| 11 | Is `onboarding.role` enum identical? | Shared constants |
| 12 | Does mobile sync `displayName` from first+last? | Profile save |

---

## 12. Files to change (implementation preview)

| File | Change |
|------|--------|
| `docs/staveto-web-onboarding-proposal.md` | This document |
| `src/lib/userProfile.ts` | Extend types; optional `completeOnboarding` payload |
| `src/services/onboarding/onboardingService.ts` | **New** — all Firestore writes |
| `src/app/(app)/onboarding/page.tsx` | Redesign steps |
| `src/components/onboarding/*.tsx` | **New** — step UI |
| `src/i18n/translations.ts` | `onboarding.*` keys |
| `src/app/register/page.tsx` | Redirect to `/onboarding` when incomplete |
| `src/context/WorkspaceContext.tsx` | Read `activeWorkspaceId` from profile on first load — optional |
| `src/lib/organizations.ts` | No breaking changes; use `createOrganization` from service |

**Not changed:** Firebase Auth, `AuthGuard` gate condition, `/join` core logic, subdomain settings, dashboard.

---

## 13. Current vs target summary

| Principle | Current web | Target |
|-----------|-------------|--------|
| Account created | Yes | Yes |
| Personal profile on `users` | Partial (type only) | firstName, lastName, displayName |
| Usage personal vs company | Implicit / confused with purpose | Explicit step 3 |
| Optional company | Auto org only with invites | Create or join branches |
| Same data mobile + web | **Blocked** verification | Shared root + onboarding map |
| Land in correct workspace | Default personal | Persist `activeWorkspaceId` |
| Completion flag | `onboarding.completed` | + `source: "web"` |

---

## Related documents

- [staveto-manager-feature-inventory.md](./staveto-manager-feature-inventory.md) — §2 Onboarding  
- [staveto-manager-architecture.md](./staveto-manager-architecture.md) — workspace bridge  
- [staveto-subdomains.md](./staveto-subdomains.md) — out of scope for onboarding phase  

---

*End of proposal — implementation requires explicit approval.*
