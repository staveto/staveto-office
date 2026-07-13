/**
 * Fetch the most recent AI estimator session facts from Firestore (REST,
 * Firebase CLI refresh token) and save them as a local validation fixture:
 * fixtures/ai-estimator/session-facts.json
 *
 * Read-only — used to validate knowledge-backend extraction quality against
 * a real analyzed drawing without re-running Gemini.
 */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT = process.env.FIREBASE_PROJECT_ID || "staveto-mvp-5f251";

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

/** Firestore REST typed value → JS. */
function fromValue(v) {
  if (v == null) return null;
  if ("nullValue" in v) return null;
  if ("booleanValue" in v) return v.booleanValue;
  if ("integerValue" in v) return Number(v.integerValue);
  if ("doubleValue" in v) return v.doubleValue;
  if ("stringValue" in v) return v.stringValue;
  if ("timestampValue" in v) return v.timestampValue;
  if ("arrayValue" in v) return (v.arrayValue.values ?? []).map(fromValue);
  if ("mapValue" in v) {
    const out = {};
    for (const [k, val] of Object.entries(v.mapValue.fields ?? {})) out[k] = fromValue(val);
    return out;
  }
  return null;
}

async function main() {
  const token = await getAccessToken();
  const base = `https://firestore.googleapis.com/v1/projects/${PROJECT}/databases/(default)/documents`;
  const res = await fetch(`${base}:runQuery`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      structuredQuery: {
        from: [{ collectionId: "aiEstimatorSessions", allDescendants: true }],
        limit: 25,
      },
    }),
  });
  const rows = await res.json();
  if (!res.ok) throw new Error(`Query failed: ${JSON.stringify(rows)}`);

  const sessions = rows
    .filter((r) => r.document)
    .map((r) => {
      const doc = {};
      for (const [k, v] of Object.entries(r.document.fields ?? {})) doc[k] = fromValue(v);
      return { name: r.document.name, ...doc };
    })
    .filter((d) => d.facts)
    .sort((a, b) => String(b.updatedAt ?? b.createdAt ?? "").localeCompare(String(a.updatedAt ?? a.createdAt ?? "")));

  if (!sessions.length) {
    console.log("No estimator sessions with facts found.");
    return;
  }

  console.log(`Found ${sessions.length} sessions:`);
  for (const s of sessions.slice(0, 10)) {
    const f = s.facts ?? {};
    console.log(
      `- ${s.name.split("/").pop()} · updated ${s.updatedAt ?? s.createdAt ?? "?"} · files: ${(f.diagnostics?.fileNames ?? []).join(", ") || "?"} · rooms ${f.rooms?.length ?? 0} · legend ${f.legendEntries?.length ?? 0} · occ ${f.symbolOccurrences?.length ?? 0} · items ${f.extractedItems?.length ?? 0}`
    );
  }

  // Prefer a session for the acceptance drawing, else newest.
  const target =
    sessions.find((s) =>
      (s.facts?.diagnostics?.fileNames ?? []).some((n) => /znacenie[_ ]elektrika/i.test(String(n)))
    ) ?? sessions[0];

  const outDir = join(__dirname, "../fixtures/ai-estimator");
  mkdirSync(outDir, { recursive: true });
  const outPath = join(outDir, "session-facts.json");
  writeFileSync(outPath, JSON.stringify(target.facts, null, 2), "utf8");
  console.log(`\nSaved facts of ${target.name.split("/").pop()} → ${outPath}`);
}

main().catch((e) => {
  console.error("Fetch failed:", e.message ?? e);
  process.exit(1);
});
