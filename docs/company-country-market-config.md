# Company country & market configuration

Phase **1.5A-1** foundation — read/adapt/resolve only. No tax engine, no quote settings, no bulk Firestore migration.

## Core product rules

| Concern | Source of truth | Must never drive |
|---------|-----------------|------------------|
| App UI language | `users/{uid}.preferredLanguage` | Company country, document language |
| Solo market (currency, timezone, tax labels, …) | `users/{uid}.soloCountryCode` + `solo*` fields | UI language |
| Company market | `organizations/{orgId}.countryCode` + org market fields | `users.primaryCountry`, `users.soloCountryCode`, UI language |
| Solo document language | `users/{uid}.soloDefaultLanguage` | UI language |
| Company document language | `organizations/{orgId}.defaultLanguage` | UI language |

## Target data model

### `users/{uid}`

- `preferredLanguage` — UI language only
- `soloCountryCode` — country of operation for solo work
- `soloCurrency`, `soloTimezone`, `soloLocale`, `soloDefaultLanguage`
- `soloTaxProfile`, `soloLegalProfile`, `soloMarketConfigVersion`

### `organizations/{orgId}`

- `countryCode` — registered company country
- `currency`, `timezone`, `locale`, `defaultLanguage`
- `taxProfile`, `legalProfile`, `marketConfigVersion`

## Legacy fields (adapters only)

| Legacy | Allowed use |
|--------|-------------|
| `users.primaryCountry` | Fallback for **`soloCountryCode` only** when solo country missing |
| `users.consentLocale` | Legal/audit consent record — **not** UI language |
| `organizations.country`, `profile.country` | Read adapters → `countryCode` |
| `activeBusinessOrgId` | Legacy mobile adapter input |

**Company workspace must never read `users.primaryCountry`.**

**UI language must never determine country.**

## Code layout (web + mobile)

| Module | Purpose |
|--------|---------|
| `src/lib/market/marketProfileContract.ts` | Shared types and constants |
| `src/lib/market/marketProfileAdapters.ts` | `readSoloMarketProfile`, `readOrganizationMarketProfile` |
| `src/lib/market/resolveActiveMarketProfile.ts` | Active workspace market resolver (read-only) |
| `src/lib/workspace/buildActiveWorkspaceContext.ts` | Exposes market fields on active context |

### Active workspace context (extended)

Existing fields kept for compatibility. New fields:

- `activeMarketSource` — `"solo_user" | "company_org"`
- `activeLocale`
- `activeDefaultDocumentLanguage` (use for future quotes/PDFs)
- `activeTaxProfile`, `activeLegalProfile`
- `marketConfigVersion`, `marketConfigWarnings`

`activeLanguage` remains as a **compatibility alias** for `activeDefaultDocumentLanguage`.

## What is implemented now (1.5A-1)

- Matching TypeScript contracts on web and mobile
- Read adapters with legacy solo fallback and warnings
- `resolveActiveMarketProfile` skeleton (no Firestore writes)
- Company country fallback to `primaryCountry` **removed**
- `consentLocale` removed from UI language path in workspace context hook (web)
- Unit tests for solo, company, legacy fallback, missing country, UI language guard

## What is NOT implemented yet

- Persisting `solo*` fields on user save flows (except types)
- Persisting org `currency`, `locale`, `defaultLanguage`, `taxProfile`, … on create/settings
- `CountryMarketConfig` with `supportedLanguages` per country
- Quote/invoice/PDF using `activeDefaultDocumentLanguage`
- Server-side tax/legal validation
- Phase 2 workspace collection or project migration

## Phase 2+ still needed

- Cloud Function defaults on `createBusinessOrg`
- Firestore rules for server-only fields
- Legal/tax compliance review per country
- Company settings UI for registered country + derived market
- Cross-device `preferredLanguage` persistence on mobile language picker

## Compliance note

All `taxProfile` / `legalProfile` structures must use `complianceStatus: "needs_legal_review"` until verified by legal review. This codebase does **not** claim final tax or invoice compliance.
