/**
 * Download the acceptance drawing PDF from Firebase Storage (GCS JSON API,
 * Firebase CLI refresh token) into fixtures/ai-estimator/08_Znacenie_elektrika_2.pdf.
 * Read-only against Storage; the fixture stays local (gitignored).
 */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const BUCKET = process.env.FIREBASE_STORAGE_BUCKET || "staveto-mvp-5f251.firebasestorage.app";
const OBJECT =
  process.env.FIXTURE_STORAGE_PATH ||
  "workspaces/oS7PLuGBKMzZYd0TRfmD/ai-drafts/sess_1783964129705_31y3ftu/08_Znacenie_elektrika 2.pdf";

function readCliOauthClient() {
  const apiPath = join(__dirname, "../node_modules/firebase-tools/lib/api.js");
  const src = readFileSync(apiPath, "utf8");
  const id = src.match(/FIREBASE_CLIENT_ID",\s*"([^"]+)"/)?.[1];
  const secret = src.match(/FIREBASE_CLIENT_SECRET",\s*"([^"]+)"/)?.[1];
  if (!id || !secret) throw new Error("Could not read OAuth client from firebase-tools.");
  return { id, secret };
}

function readCliRefreshToken() {
  const home = process.env.USERPROFILE || process.env.HOME || "";
  const candidates = [
    join(home, ".config", "configstore", "firebase-tools.json"),
    join(process.env.APPDATA ?? "", "configstore", "firebase-tools.json"),
  ];
  for (const configPath of candidates) {
    try {
      const config = JSON.parse(readFileSync(configPath, "utf8"));
      const token = config?.tokens?.refresh_token;
      if (token) return token;
    } catch {
      /* try next location */
    }
  }
  throw new Error("No Firebase CLI refresh token — run: npx firebase-tools login");
}

async function getAccessToken() {
  const client = readCliOauthClient();
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: readCliRefreshToken(),
      client_id: client.id,
      client_secret: client.secret,
    }),
  });
  const json = await res.json();
  if (!res.ok) throw new Error(`Token exchange failed: ${JSON.stringify(json)}`);
  return json.access_token;
}

async function main() {
  const token = await getAccessToken();
  const url = `https://storage.googleapis.com/storage/v1/b/${BUCKET}/o/${encodeURIComponent(OBJECT)}?alt=media`;
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) {
    throw new Error(`Download failed (${res.status}): ${await res.text()}`);
  }
  const bytes = Buffer.from(await res.arrayBuffer());
  const outDir = join(__dirname, "../fixtures/ai-estimator");
  mkdirSync(outDir, { recursive: true });
  const outPath = join(outDir, "08_Znacenie_elektrika_2.pdf");
  writeFileSync(outPath, bytes);
  console.log(`Saved ${bytes.length} bytes → ${outPath}`);
}

main().catch((e) => {
  console.error("Fetch failed:", e.message ?? e);
  process.exit(1);
});
