/**
 * Hard-delete project(s) by name match + all subcollections + Storage + quotes.
 *
 * Usage:
 *   node scripts/purge-project-by-name.mjs --name "Neapolis 3"
 *   node scripts/purge-project-by-name.mjs --id PROJECT_ID
 *   node scripts/purge-project-by-name.mjs --name "Neapolis 3" --yes
 *
 * Auth: FIREBASE_SERVICE_ACCOUNT_JSON in env/.env.local, or ADC.
 */
import { createRequire } from "module";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import { readFileSync, existsSync } from "fs";

const require = createRequire(import.meta.url);
const __dirname = dirname(fileURLToPath(import.meta.url));
const admin = require(join(__dirname, "../functions/node_modules/firebase-admin"));

const FIREBASE_PROJECT =
  process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID?.trim() || "staveto-mvp-5f251";

function loadEnvLocal() {
  const envPath = join(__dirname, "../.env.local");
  if (!existsSync(envPath)) return;
  const raw = readFileSync(envPath, "utf8");
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq <= 0) continue;
    const key = trimmed.slice(0, eq).trim();
    let val = trimmed.slice(eq + 1).trim();
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    if (!process.env[key]) process.env[key] = val;
  }
}

function parseArgs(argv) {
  let name = null;
  let id = null;
  let yes = false;
  for (let i = 2; i < argv.length; i++) {
    if (argv[i] === "--name" && argv[i + 1]) name = argv[++i];
    else if (argv[i] === "--id" && argv[i + 1]) id = argv[++i];
    else if (argv[i] === "--yes") yes = true;
  }
  return { name, id, yes };
}

function initAdmin() {
  loadEnvLocal();
  if (admin.apps.length) return admin.app();
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT_JSON?.trim();
  if (raw) {
    const sa = JSON.parse(raw);
    return admin.initializeApp({
      credential: admin.credential.cert(sa),
      projectId: FIREBASE_PROJECT,
      storageBucket:
        process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET?.trim() || undefined,
    });
  }
  return admin.initializeApp({
    projectId: FIREBASE_PROJECT,
    storageBucket:
      process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET?.trim() || undefined,
  });
}

async function deleteCollectionRecursive(colRef) {
  let total = 0;
  const snap = await colRef.limit(400).get();
  if (snap.empty) return 0;

  for (const docSnap of snap.docs) {
    const subs = await docSnap.ref.listCollections();
    for (const sub of subs) {
      total += await deleteCollectionRecursive(sub);
    }
  }

  const batch = admin.firestore().batch();
  snap.docs.forEach((d) => batch.delete(d.ref));
  await batch.commit();
  total += snap.size;

  if (snap.size >= 400) {
    total += await deleteCollectionRecursive(colRef);
  }
  return total;
}

async function deleteProjectTree(db, projectId) {
  const projectRef = db.doc(`projects/${projectId}`);
  const subs = await projectRef.listCollections();
  let total = 0;
  for (const sub of subs) {
    const n = await deleteCollectionRecursive(sub);
    if (n > 0) console.log(`  ${sub.id}: ${n} docs`);
    total += n;
  }
  await projectRef.delete();
  return total;
}

async function deleteQuotes(db, projectId) {
  const snap = await db.collection("quotes").where("projectId", "==", projectId).get();
  if (snap.empty) return 0;
  const batch = db.batch();
  snap.docs.forEach((d) => batch.delete(d.ref));
  await batch.commit();
  return snap.size;
}

async function deleteEstimatorSession(db, sessionId) {
  if (!sessionId) return false;
  const ref = db.doc(`estimatorSessions/${sessionId}`);
  const snap = await ref.get();
  if (!snap.exists) return false;
  const subs = await ref.listCollections();
  for (const sub of subs) {
    await deleteCollectionRecursive(sub);
  }
  await ref.delete();
  return true;
}

async function deleteStoragePrefix(bucket, prefix) {
  if (!bucket) return 0;
  const [files] = await bucket.getFiles({ prefix });
  if (!files.length) return 0;
  await Promise.all(files.map((f) => f.delete().catch(() => undefined)));
  return files.length;
}

async function main() {
  const { name, id, yes } = parseArgs(process.argv);
  if (!name && !id) {
    console.error('Usage: node scripts/purge-project-by-name.mjs --name "Neapolis 3" --yes');
    process.exit(1);
  }

  initAdmin();
  const db = admin.firestore();
  const bucketName = process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET?.trim();
  const bucket = bucketName ? admin.storage().bucket(bucketName) : null;

  let targets = [];
  if (id) {
    const snap = await db.doc(`projects/${id}`).get();
    if (!snap.exists) {
      console.log(`Project ${id} not found.`);
      return;
    }
    targets = [{ id: snap.id, data: snap.data() }];
  } else {
    const needle = name.toLowerCase();
    const snap = await db.collection("projects").limit(500).get();
    targets = snap.docs
      .filter((d) => String(d.data()?.name ?? "").toLowerCase().includes(needle))
      .map((d) => ({ id: d.id, data: d.data() }));
  }

  if (targets.length === 0) {
    console.log(`No projects matched${name ? ` name containing "${name}"` : ""}.`);
    return;
  }

  console.log(`Matched ${targets.length} project(s):`);
  for (const t of targets) {
    console.log(`  - ${t.id}  |  ${t.data?.name ?? "(no name)"}  |  ${t.data?.addressText ?? ""}`);
  }

  if (!yes) {
    console.log("\nDry run. Re-run with --yes to delete permanently.");
    return;
  }

  for (const t of targets) {
    console.log(`\nPurging ${t.id}…`);
    const quotes = await deleteQuotes(db, t.id);
    if (quotes) console.log(`  quotes: ${quotes}`);
    const sessionId = t.data?.aiEstimatorSessionId;
    if (sessionId) {
      const ok = await deleteEstimatorSession(db, sessionId);
      if (ok) console.log(`  estimatorSession: ${sessionId}`);
    }
    const storageN = await deleteStoragePrefix(bucket, `projects/${t.id}/`);
    if (storageN) console.log(`  storage files: ${storageN}`);
    const subs = await deleteProjectTree(db, t.id);
    console.log(`  Done. Subcollection docs: ${subs}`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
