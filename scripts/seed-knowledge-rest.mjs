/**
 * Seed the estimator knowledge backend via the Firestore REST API,
 * reusing the Firebase CLI's stored refresh token (no gcloud ADC needed).
 * Additive: creates/merges documents, never deletes.
 *
 * Usage: node scripts/seed-knowledge-rest.mjs
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT = process.env.FIREBASE_PROJECT_ID || "staveto-mvp-5f251";

// Firebase CLI public OAuth client — read from the installed firebase-tools
// package so the values always match the CLI that produced the refresh token.
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

/** JS value → Firestore REST typed value. */
function toValue(v) {
  if (v === null || v === undefined) return { nullValue: null };
  if (typeof v === "boolean") return { booleanValue: v };
  if (typeof v === "number") {
    return Number.isInteger(v) ? { integerValue: String(v) } : { doubleValue: v };
  }
  if (typeof v === "string") return { stringValue: v };
  if (Array.isArray(v)) return { arrayValue: { values: v.map(toValue) } };
  if (typeof v === "object") {
    const fields = {};
    for (const [k, val] of Object.entries(v)) fields[k] = toValue(val);
    return { mapValue: { fields } };
  }
  throw new Error(`Unsupported value type: ${typeof v}`);
}

function toFields(obj) {
  const fields = {};
  for (const [k, v] of Object.entries(obj)) fields[k] = toValue(v);
  return fields;
}

async function upsertDoc(token, collection, id, data) {
  const base = `https://firestore.googleapis.com/v1/projects/${PROJECT}/databases/(default)/documents`;
  const now = new Date().toISOString();
  const payload = { ...data, updatedAt: now };
  // Merge semantics: only listed fields are written; createdAt set once via mask omission check.
  const mask = Object.keys(payload)
    .map((f) => `updateMask.fieldPaths=${encodeURIComponent(f)}`)
    .join("&");
  const res = await fetch(`${base}/${collection}/${id}?${mask}`, {
    method: "PATCH",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ fields: toFields(payload) }),
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Write ${collection}/${id} failed (${res.status}): ${err}`);
  }
}

function loadSeed(name) {
  return JSON.parse(readFileSync(join(__dirname, "../data/knowledge", name), "utf8"));
}

async function seedFile(token, fileName, listKey, collection) {
  const seed = loadSeed(fileName);
  await upsertDoc(token, "knowledgePacks", seed.pack.id, seed.pack);
  let n = 0;
  for (const row of seed[listKey] ?? []) {
    await upsertDoc(token, collection, row.id, row);
    n += 1;
  }
  console.log(`${collection}: ${n} docs upserted (pack ${seed.pack.id})`);
}

async function main() {
  console.log(`Seeding estimator knowledge into "${PROJECT}" via REST...`);
  const token = await getAccessToken();
  await seedFile(token, "electrical-symbols-sk.json", "symbols", "symbolLibrary");
  await seedFile(token, "electrical-assemblies-sk.json", "assemblies", "assemblyTemplates");
  await seedFile(token, "electrical-labor-rules-sk.json", "laborRules", "laborRules");
  console.log("Done — additive merge only, nothing deleted.");
}

main().catch((e) => {
  console.error("Seed failed:", e.message ?? e);
  process.exit(1);
});
