# Staveto AI — Project Draft Agent

Server-side AI for the **Nová zákazka → Pomocou AI** flow. No Gemini/API keys in the frontend.

## Deploy Cloud Functions

```bash
cd functions
npm install
npm run build
cd ..
firebase functions:secrets:set GEMINI_API_KEY
firebase deploy --only functions:generateProjectDraft,functions:updateProjectDraftWithAI,functions:createProjectFromDraft,firestore:rules,storage
```

### Windows — `npm` / `firebase` not recognized in Cursor terminal

Node is usually at `C:\nvm4w\nodejs` (nvm-windows). That folder is missing from PATH in some integrated terminals.

**Option A — one session (paste in PowerShell):**

```powershell
$env:Path = "C:\nvm4w\nodejs;" + $env:Path
cd c:\Users\Marek\Staveto_Cursor\staveto-app_v2\staveto-office
npm run firebase:login
```

**Option B — project scripts (no PATH needed):**

```powershell
cd c:\Users\Marek\Staveto_Cursor\staveto-app_v2\staveto-office
.\scripts\firebase-login.ps1
```

Deploy (build + secret prompt + deploy): `.\scripts\firebase-deploy.ps1`

Skip secret if `GEMINI_API_KEY` is already in GCP: `.\scripts\firebase-deploy.ps1 -SkipSecret`

If CLI cannot reach Google APIs (SSL/proxy): `.\scripts\firebase-deploy.ps1 -RelaxedTls` or `-SkipSecret -RelaxedTls`

Functions only (no rules/storage): `npm run firebase:deploy:functions`

### Windows — `Failed to make request to cloudresourcemanager.googleapis.com`

Same class of problem as `auth.firebase.tools/attest`: firewall, proxy, or antivirus blocking **Google Cloud API** calls during `firebase functions:secrets:set` or `firebase deploy`.

**If `GEMINI_API_KEY` is already configured** (e.g. from an earlier deploy):

```powershell
cd c:\Users\Marek\Staveto_Cursor\staveto-app_v2\staveto-office
.\scripts\firebase-deploy.ps1 -SkipSecret
```

Or only functions:

```powershell
npm run firebase:deploy:functions
```

**If the secret is not set yet** — use [Google Cloud Secret Manager](https://console.cloud.google.com/security/secret-manager?project=staveto-mvp-5f251):

1. **Create secret** → name: `GEMINI_API_KEY` → value: your Gemini API key from [Google AI Studio](https://aistudio.google.com/apikey).
2. Grant access to the Cloud Functions service account if prompted.
3. Deploy with `-SkipSecret`:

```powershell
.\scripts\firebase-deploy.ps1 -SkipSecret -RelaxedTls
```

**Relaxed TLS for the whole deploy** (when attest/login workaround was needed too):

```powershell
.\scripts\firebase-deploy.ps1 -RelaxedTls
```

### Windows — „Firebase CLI Login Failed“ (localhost:9005)

The browser opens `http://localhost:9005/...` after Google sign-in. If you see **Oops! Firebase CLI Login Failed**:

1. Close that tab. In PowerShell (project folder), use the **copy-paste** flow instead:

```powershell
$env:Path = "C:\nvm4w\nodejs;" + $env:Path
cd c:\Users\Marek\Staveto_Cursor\staveto-app_v2\staveto-office
npm run firebase:login:no-localhost
```

2. Open the **URL** printed in the terminal (not localhost). Sign in with the **Google account that owns** Firebase project `staveto-mvp-5f251`.

3. Copy the **authorization code** from the browser and paste it into the terminal. Wait for `Success! Logged in as ...`.

4. Verify: `npx firebase projects:list` — you should see `staveto-mvp-5f251`.

**If it still fails:**

- Disable VPN / ad blockers for the login tab.
- Try an external terminal (Windows Terminal), not only Cursor’s integrated shell.
- Run `firebase logout` then `npm run firebase:login:no-localhost` again.
- Use the same Google account as in [Firebase Console](https://console.firebase.google.com/) for this project.

### Windows — `Failed to make request to https://auth.firebase.tools/attest`

This happens **before** the browser opens — the CLI cannot reach Firebase’s attest endpoint. Typical causes:

| Cause | What to do |
|--------|------------|
| Corporate proxy / SSL inspection | IT allowlist `auth.firebase.tools`, `accounts.google.com`, or use phone hotspot |
| ESET / antivirus HTTPS scan | Advanced → SSL/TLS → exclude `node.exe` / terminal, or pause scan briefly |
| Certificate revocation blocked (`CRYPT_E_NO_REVOCATION_CHECK`) | Different network, or workaround below |
| Stale `HTTP_PROXY` / `HTTPS_PROXY` | In PowerShell: `Remove-Item Env:HTTP_PROXY, Env:HTTPS_PROXY -ErrorAction SilentlyContinue` |

**Test connectivity (PowerShell):**

```powershell
curl.exe --ssl-no-revoke -sS -X POST "https://auth.firebase.tools/attest" -H "Content-Type: application/json" -d "{\"session_id\":\"test\"}"
```

You should get JSON (e.g. `{"token":"..."}`), not timeout or SSL error.

**Workaround A — relaxed TLS (login only, this session):**

```powershell
cd c:\Users\Marek\Staveto_Cursor\staveto-app_v2\staveto-office
.\scripts\firebase-login-attest-workaround.ps1
```

Or: `npm run firebase:login:workaround`

**Workaround B — gcloud instead of `firebase login` (often works on locked-down PCs):**

1. Install [Google Cloud SDK](https://cloud.google.com/sdk/docs/install).
2. `gcloud auth login`
3. `gcloud auth application-default login`
4. `gcloud config set project staveto-mvp-5f251`
5. Then from project folder: `npm run firebase:deploy`

**Workaround C — deploy from another network**

Run `npm run firebase:login:no-localhost` and `npm run firebase:deploy` on home network / mobile hotspot, then return to office Wi‑Fi for app dev.

**Important:** This repo only defines 3 AI callables. Production has many other functions (`getBillingStatus`, webhooks, …) from a separate backend. Always deploy **named** functions (see `npm run firebase:deploy`) — never answer **Yes** to “delete functions not in source”, or you will remove live production APIs.

**Permanent fix:** System → Environment Variables → User `Path` → add `C:\nvm4w\nodejs`, then restart Cursor.

Optional models (defaults: vision `gemini-2.5-flash-lite`, draft `gemini-2.5-flash`):

```bash
# Fast vision extraction (photos/PDFs) — parallel, text-only summaries
firebase functions:secrets:set GEMINI_VISION_MODEL
# e.g. gemini-2.5-flash-lite, gemini-2.0-flash-lite

# JSON project draft generation (text only, faster than multimodal)
firebase functions:secrets:set GEMINI_MODEL
# e.g. gemini-2.5-flash, gemini-2.0-flash

npm run firebase:deploy:functions
```

Pipeline: attachments → **GEMINI_VISION_MODEL** (bullet summaries) → **GEMINI_MODEL** (JSON draft). Set `GEMINI_DRAFT_INLINE_VISION=1` only to revert to one heavy multimodal draft call.

Region: **europe-west1** (same as `getBillingStatus`).

## Error: Gemini API quota exceeded (429)

The integration works; Google rejected the request because the **free-tier quota** for the configured model is used up (`limit: 0` on daily or per-minute limits).

**Fix (pick one):**

1. **Wait** — free-tier daily limits reset (often midnight Pacific). Per-minute limits reset within ~1 minute; the server retries automatically up to 3 times.
2. **Enable billing** on the Google Cloud / AI Studio project tied to `GEMINI_API_KEY`: [Google AI Studio](https://aistudio.google.com/apikey) → project → billing.
3. **Use another model** with separate quota, e.g. `gemini-2.5-flash` or `gemini-2.0-flash-lite` via `GEMINI_MODEL` secret, then redeploy functions.
4. **New API key** in a fresh GCP project (only if you intentionally want a separate quota pool).

Monitor usage: [ai.dev/rate-limit](https://ai.dev/rate-limit) and [Gemini rate limits](https://ai.google.dev/gemini-api/docs/rate-limits).

## Deploy error: “Failed to set invoker” / IAM policy

Gen‑2 callables run on **Cloud Run**. Firebase must grant **`allUsers`** the **Cloud Run Invoker** role so the web/mobile SDK can call them. Deploy fails if your Google account lacks permission to change IAM (e.g. only `roles/functions.developer`, not **Owner** / **Cloud Functions Admin** / **Cloud Run Admin**).

**Symptom:** Functions appear in `firebase functions:list` but deploy ends with `Failed to set invoker`.

### Fix A — Google Cloud Console (recommended)

1. Open [Cloud Run](https://console.cloud.google.com/run?project=staveto-mvp-5f251) → region **europe-west1**.
2. For each service (names are lowercase):
   - `generateprojectdraft`
   - `updateprojectdraftwithai`
   - `createprojectfromdraft`
3. Click the service → **Permissions** → **Grant access**.
4. New principal: `allUsers` → Role: **Cloud Run Invoker** → Save.

If org policy blocks `allUsers`, ask your GCP admin for an exception or to apply the binding for you.

### Fix B — gcloud (account with Owner / Run Admin)

```bash
gcloud auth login
gcloud config set project staveto-mvp-5f251

for svc in generateprojectdraft updateprojectdraftwithai createprojectfromdraft; do
  gcloud run services add-iam-policy-binding "$svc" \
    --region=europe-west1 \
    --member=allUsers \
    --role=roles/run.invoker
done
```

### Fix C — grant deploy account more IAM (long-term)

In [IAM](https://console.cloud.google.com/iam-admin/iam?project=staveto-mvp-5f251), add one of:

- **Owner** (simplest for solo projects), or
- **Cloud Functions Admin** (`roles/cloudfunctions.admin`), or
- **Cloud Run Admin** (`roles/run.admin`)

Then re-run `npm run firebase:deploy` (safe — only updates the 3 AI functions).

**Note:** If functions already exist after a failed deploy, Fix A or B is enough; a full redeploy is optional.

## Callable functions

| Function | Purpose |
|----------|---------|
| `generateProjectDraft` | First structured draft from description + files |
| `updateProjectDraftWithAI` | Chat refinement |
| `createProjectFromDraft` | Final project after user confirmation only |

## Firestore paths

- `workspaces/{workspaceKey}/projectDrafts/{draftId}`
- `workspaces/{workspaceKey}/aiDraftFiles/{fileId}`
- Final projects: top-level `projects` (compatible with existing app) + `tasks`, `materials`, `quoteItems` subcollections

`workspaceKey` = user uid (personal) or `orgId` (company).

## Frontend flow

1. Method step: description, location, file upload → Storage + `aiDraftFiles`
2. Concept step: **Vytvoriť AI návrh** → `generateProjectDraft`
3. Preview + **Staveto AI** chat → `updateProjectDraftWithAI`
4. **Vytvoriť projekt** → `createProjectFromDraft` (only path that creates `projects`)

## Local emulator (optional)

```bash
firebase emulators:start --only functions,firestore,storage
```

Point the app to emulators via Firebase SDK emulator config if needed.
