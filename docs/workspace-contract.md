# Workspace contract (Phase 1)

Short reference for web (`staveto-office`) and mobile (`mobile`). Both repos must stay aligned.

## User vs workspace

- **User account** = identity only (`users/{uid}`).
- **Work** always happens inside an **active workspace**.
- UI language = `users/{uid}.preferredLanguage` (user preference).
- Country, currency, timezone, document language = **active workspace** (company profile or user primary country for solo).

Do **not** derive business country from UI language.

## Workspace types

| Product type | Legacy Firestore `type` | Workspace id |
|--------------|-------------------------|--------------|
| solo         | `personal`              | `"personal"` (`SOLO_WORKSPACE_ID`) |
| company      | `company` / `team`      | `organizations/{orgId}` → id **is** `orgId` |

Constants (both repos — `src/lib/workspace/workspaceContract.ts`):

- `SOLO_WORKSPACE_ID = "personal"`
- `ACTIVE_WORKSPACE_PROFILE_FIELD = "lastActiveWorkspaceId"`
- `COMPANY_WORKSPACE_SOURCE = "organization"`
- `WorkspaceKind` / `WorkspaceType`: `"solo" | "company"`

## Active workspace context (UI + services)

Both platforms expose the same logical fields via `buildActiveWorkspaceContext` / `useActiveWorkspaceContext`:

- `activeWorkspaceId`
- `activeWorkspaceType` — `"solo" | "company"`
- `activeWorkspaceName` — solo: `{firstName} – moje zákazky`; company: `legalName` → `name` → `"Firma"`
- `activeRole`
- `activeCountryCode`
- `activeCurrency`
- `activeTimezone`
- `activeLanguage` — workspace/document default (not UI language)
- `userPreferredLanguage` — UI language (separate)

## Legacy names (compatibility only)

These may remain in Firestore or adapters but **must not spread** into new UI code:

| Legacy | Use instead | Notes |
|--------|-------------|--------|
| `activeBusinessOrgId` | `activeWorkspaceId` when type is company | Still on `users/{uid}` for mobile/history |
| `business` / `team` workspace type strings | `company` / `WorkspaceKind.company` | Onboarding may still write `"business"` |
| `AuthContext.orgId` (mobile) | Solo namespace only — **never** business org id | See business-architecture rule |

Isolate legacy reads/writes in service adapters (`workspaceService`, `BusinessContext`, onboarding).

## Duplicate company prevention (Phase 1.4)

Before creating a new organization (web onboarding, `createBusinessOrg`, legacy `createOrganization`, mobile registration):

1. Normalize company name / legalName (`normalizeCompanyIdentityName`).
2. Load user's existing org memberships.
3. If same normalized identity exists → **do not create**; use canonical org (by project/member/profile score).
4. If multiple data-rich duplicates → block creation; user must review diagnostics.
5. Switcher still hides non-canonical duplicates (Phase 1.3); diagnostics shows all.

**No** server-side uniqueness registry, **no** new collections, **no** merge/delete in Phase 1.

## Forbidden without explicit review

- `workspaces/` collection
- Project collection migration
- Automatic org merge / delete / archive
- Client writes to server-only org fields (`status`, `businessEnabled`, seats, …)
- Changing mobile `AuthContext.orgId` semantics

## Key files

| Area | Web | Mobile |
|------|-----|--------|
| Contract | `src/lib/workspace/workspaceContract.ts` | `src/lib/workspace/workspaceContract.ts` |
| Active context | `buildActiveWorkspaceContext.ts`, `useActiveWorkspaceContext.ts` | same |
| Duplicate guard | `companyIdentityGuard.ts` | `companyIdentityGuard.ts`, `guardCompanyCreation.ts` |
| Switcher suppression | `workspaceDuplicateSuppression.ts` | (web switcher; mobile uses BusinessContext) |
| Diagnostics | Settings → Workspace diagnostics | N/A (web tool) |
