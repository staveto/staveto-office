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

**Important:** This repo only defines 3 AI callables. Production has many other functions (`getBillingStatus`, webhooks, …) from a separate backend. Always deploy **named** functions (see `npm run firebase:deploy`) — never answer **Yes** to “delete functions not in source”, or you will remove live production APIs.

**Permanent fix:** System → Environment Variables → User `Path` → add `C:\nvm4w\nodejs`, then restart Cursor.

Optional: `firebase functions:secrets:set GEMINI_MODEL` (default `gemini-2.0-flash`).

Region: **europe-west1** (same as `getBillingStatus`).

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
