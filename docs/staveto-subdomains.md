# Staveto company subdomains

**Status:** App-level readiness (Phase: tenant subdomains)  
**Not included in code:** DNS records, Vercel project domains, Firebase Hosting custom domains

## Goal

Each company organization can use a dedicated subdomain:

- `https://elc.staveto.com`
- `https://marekstavby.staveto.com`

The generic app entry remains:

- `https://app.staveto.com` — login, personal workspace, workspace switcher

## Data model (additive)

Optional fields on `organizations/{orgId}`:

| Field | Type | Notes |
|-------|------|--------|
| `slug` | string | Unique, normalized (`a-z`, `0-9`, `-`) |
| `domain` | string | e.g. `https://elc.staveto.com` |
| `subdomainEnabled` | boolean | When `false`, tenant URL shows not found |
| `slugUpdatedAt` | timestamp | |
| `slugUpdatedBy` | string | uid |

Organizations without a slug continue to work on `app.staveto.com` only.

## Firestore

### Query

`getOrganizationBySlug` uses:

```
organizations where slug == {normalizedSlug} limit 1
```

Create composite/single-field index in Firebase Console if prompted:

- Collection: `organizations`
- Field: `slug` (Ascending)

### Rules (example)

Allow authenticated users to read organizations they belong to; restrict slug updates to org admins (align with existing `organizations` rules).

## App behavior

| Host | Behavior |
|------|----------|
| `app.staveto.com` | Unchanged — personal + switcher |
| `{slug}.staveto.com` | Resolve org by slug → open company workspace after login |
| Unknown slug | “Workspace not found” |
| Not a member | Access denied + link to `/join` and app entry |

Implementation:

- `src/lib/workspaceSlug.ts` — normalize / validate / reserved slugs
- `src/services/organization/organizationService.ts` — slug CRUD helpers
- `src/services/tenant/tenantResolver.ts` — hostname → tenant
- `src/context/WorkspaceContext.tsx` — tenant-aware active workspace
- `src/app/(app)/app/settings` — slug editor (team admin)

Environment:

```env
NEXT_PUBLIC_STAVETO_BASE_DOMAIN=staveto.com
```

## Local development

### Default (app mode)

```bash
npm run dev
# http://localhost:3000
```

### Company subdomain (recommended)

Modern browsers resolve `*.localhost` without `/etc/hosts`:

```
http://elc.localhost:3000
```

1. In Firebase, set organization slug to `elc` and `subdomainEnabled: true` (or use Settings UI on app).
2. Sign in with a user who is a member of that org.
3. Open `http://elc.localhost:3000` — app should land in that organization workspace.

### Alternative: hosts file

If `elc.localhost` does not work on your OS:

```
# Windows: C:\Windows\System32\drivers\etc\hosts
# macOS/Linux: /etc/hosts
127.0.0.1 elc.localhost
```

Then use `http://elc.localhost:3000`.

Note: `elc.staveto.com` locally still requires DNS pointing to your dev machine or a tunnel (ngrok, Cloudflare Tunnel) — not required for most UI testing.

## DNS and hosting (later — not in repo)

### DNS (production)

At your DNS provider (e.g. Websupport):

| Type | Host | Target |
|------|------|--------|
| CNAME | `app` | Vercel DNS target |
| CNAME | `*` | Vercel DNS target (wildcard for `{slug}.staveto.com`) |

Or individual CNAMEs per company (not scalable).

### Vercel

1. Project → **Settings** → **Domains**
2. Add `app.staveto.com`
3. Add wildcard `*.staveto.com` (Vercel Pro / team feature may be required for wildcard SSL)
4. Confirm SSL certificates issued for apex wildcard

### Firebase

- **Auth → Authorized domains:** add `app.staveto.com` and `staveto.com` (or each subdomain if wildcard auth domain is not used).
- For Google sign-in, OAuth **Authorized JavaScript origins** must include `https://{slug}.staveto.com` or use a pattern your Google Cloud project allows.
- **Firestore / Functions:** same Firebase project; no schema migration required.

### Firebase Hosting (if used instead of Vercel)

Configure multiple custom domains or wildcard custom domain in Firebase Hosting console; rewrite all hosts to the same Next/static app.

## Reserved slugs

Blocked in app validation: `app`, `www`, `admin`, `api`, `mail`, `support`, `help`, `blog`, `login`, `register`, `dashboard`, `billing`, `settings`, `firebase`, `google`.

## Related docs

- [staveto-manager-architecture.md](./staveto-manager-architecture.md)
- [FIRESTORE_RULES_NOTES.md](./FIRESTORE_RULES_NOTES.md)
