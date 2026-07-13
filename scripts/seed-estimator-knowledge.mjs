/**
 * Seed the estimator knowledge backend from data/knowledge/*.json.
 * Additive & non-destructive: merge writes only, never deletes.
 *
 * Usage:
 *   node scripts/seed-estimator-knowledge.mjs            # live project
 *   FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 node scripts/seed-estimator-knowledge.mjs
 */
import { createRequire } from "module";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import { readFileSync } from "fs";

const require = createRequire(import.meta.url);
const __dirname = dirname(fileURLToPath(import.meta.url));
const admin = require(join(__dirname, "../functions/node_modules/firebase-admin"));

const FIREBASE_PROJECT = process.env.FIREBASE_PROJECT_ID || "staveto-mvp-5f251";

if (!admin.apps.length) {
  admin.initializeApp({ projectId: FIREBASE_PROJECT });
}

const db = admin.firestore();
const { FieldValue } = admin.firestore;

function loadSeed(name) {
  const raw = readFileSync(join(__dirname, "../data/knowledge", name), "utf8");
  return JSON.parse(raw);
}

async function upsert(collectionPath, id, data) {
  const ref = db.collection(collectionPath).doc(id);
  const snap = await ref.get();
  const payload = {
    ...data,
    updatedAt: FieldValue.serverTimestamp(),
    ...(snap.exists ? {} : { createdAt: FieldValue.serverTimestamp() }),
  };
  await ref.set(payload, { merge: true });
  return snap.exists ? "updated" : "created";
}

async function seedFile(fileName, listKey, collectionPath) {
  const seed = loadSeed(fileName);
  const packResult = await upsert("knowledgePacks", seed.pack.id, seed.pack);
  console.log(`knowledgePacks/${seed.pack.id}: ${packResult}`);

  let created = 0;
  let updated = 0;
  for (const row of seed[listKey] ?? []) {
    const result = await upsert(collectionPath, row.id, row);
    if (result === "created") created += 1;
    else updated += 1;
  }
  console.log(`${collectionPath}: ${created} created, ${updated} updated (${fileName})`);
}

async function main() {
  console.log(`Seeding estimator knowledge into project "${FIREBASE_PROJECT}"...`);
  await seedFile("electrical-symbols-sk.json", "symbols", "symbolLibrary");
  await seedFile("electrical-assemblies-sk.json", "assemblies", "assemblyTemplates");
  await seedFile("electrical-labor-rules-sk.json", "laborRules", "laborRules");
  console.log("Done. No documents were deleted or overwritten destructively.");
}

main().catch((err) => {
  console.error("Seed failed:", err);
  process.exit(1);
});
