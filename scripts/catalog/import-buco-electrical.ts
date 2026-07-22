/**
 * BUCO electrical catalog importer (Phase 1).
 *
 * Dry-run (default): parse + normalize + report, NO Firestore writes.
 * Commit:   node --experimental-strip-types scripts/catalog/import-buco-electrical.ts --commit
 *
 * Auth: FIREBASE_SERVICE_ACCOUNT_JSON in .env.local, or ADC.
 */

import { createRequire } from "node:module";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  buildElectricalCatalogFromProducts,
  parseBucoSourceFile,
  type ElectricalCatalogCategory,
  type ElectricalCatalogImport,
  type ElectricalCatalogProduct,
} from "../../src/lib/catalog/electrical";

const require = createRequire(import.meta.url);
const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "../..");

const DEFAULT_SOURCE = join(
  ROOT,
  "scripts/catalog/data/SK/electrical/buco_scraper_state.json"
);
const REPORT_PATH = join(
  ROOT,
  "scripts/catalog/reports/buco-electrical-dry-run.json"
);

const FIREBASE_PROJECT =
  process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID?.trim() ||
  process.env.FIREBASE_PROJECT_ID?.trim() ||
  "staveto-mvp-5f251";

const BATCH_SIZE = 400;

function loadEnvLocal() {
  const envPath = join(ROOT, ".env.local");
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

function parseArgs(argv: string[]) {
  let commit = false;
  let source = DEFAULT_SOURCE;
  for (let i = 2; i < argv.length; i++) {
    if (argv[i] === "--commit") commit = true;
    else if (argv[i] === "--source" && argv[i + 1]) source = resolve(argv[++i]);
    else if (argv[i] === "--help" || argv[i] === "-h") {
      console.log(`Usage:
  npm run catalog:buco:dry-run
  npm run catalog:buco:import

Options:
  --commit          Write to Firestore (upsert). Default: dry-run only.
  --source <path>   Source JSON / JSONL (default: ${DEFAULT_SOURCE})
`);
      process.exit(0);
    }
  }
  return { commit, source };
}

function hasAdminCredentials(): { ok: boolean; via: string | null } {
  if (process.env.FIREBASE_SERVICE_ACCOUNT_JSON?.trim()) {
    return { ok: true, via: "FIREBASE_SERVICE_ACCOUNT_JSON" };
  }
  if (process.env.GOOGLE_APPLICATION_CREDENTIALS?.trim()) {
    const p = process.env.GOOGLE_APPLICATION_CREDENTIALS.trim();
    if (existsSync(p)) return { ok: true, via: `GOOGLE_APPLICATION_CREDENTIALS (${p})` };
  }
  const adc =
    process.env.APPDATA != null
      ? join(process.env.APPDATA, "gcloud", "application_default_credentials.json")
      : "";
  if (adc && existsSync(adc)) {
    return { ok: true, via: `ADC file (${adc})` };
  }
  return { ok: false, via: null };
}

function printCredentialsHelp() {
  console.error(`
Firebase Admin credentials missing — cannot write to Firestore.

Fix (recommended for this project):
  npm run setup:firebase-admin
  # browser login as info@staveto.sk, then:
  npm run catalog:buco:import

Or set in .env.local:
  FIREBASE_SERVICE_ACCOUNT_JSON={...service account json...}

Dry-run does not need credentials:
  npm run catalog:buco:dry-run
`);
}

function initAdmin() {
  loadEnvLocal();
  const creds = hasAdminCredentials();
  if (!creds.ok) {
    printCredentialsHelp();
    throw new Error("Could not load Firebase Admin credentials");
  }
  console.log(`Using credentials via: ${creds.via}`);

  // Prefer root firebase-admin; fall back to functions bundle.
  let admin: typeof import("firebase-admin");
  try {
    admin = require("firebase-admin");
  } catch {
    admin = require(join(ROOT, "functions/node_modules/firebase-admin"));
  }
  if (admin.apps.length) return admin;
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT_JSON?.trim();
  if (raw) {
    const sa = JSON.parse(raw);
    admin.initializeApp({
      credential: admin.credential.cert(sa),
      projectId: FIREBASE_PROJECT,
    });
  } else {
    admin.initializeApp({
      credential: admin.credential.applicationDefault(),
      projectId: FIREBASE_PROJECT,
    });
  }
  return admin;
}

async function commitToFirestore(
  admin: typeof import("firebase-admin"),
  categories: ElectricalCatalogCategory[],
  products: ElectricalCatalogProduct[],
  importDoc: ElectricalCatalogImport
) {
  const db = admin.firestore();
  const now = admin.firestore.FieldValue.serverTimestamp();

  importDoc.status = "importing";
  await db.collection("catalogImports").doc(importDoc.id).set(
    {
      ...importDoc,
      startedAt: now,
      finishedAt: null,
    },
    { merge: true }
  );

  const writeBatch = async (
    collection: string,
    docs: Array<{ id: string } & Record<string, unknown>>
  ) => {
    for (let i = 0; i < docs.length; i += BATCH_SIZE) {
      const chunk = docs.slice(i, i + BATCH_SIZE);
      const batch = db.batch();
      for (const doc of chunk) {
        const { id, ...rest } = doc;
        batch.set(
          db.collection(collection).doc(id),
          {
            ...rest,
            updatedAt: now,
          },
          { merge: true }
        );
      }
      await batch.commit();
      console.log(`  wrote ${collection} ${i + chunk.length}/${docs.length}`);
    }
  };

  console.log("Upserting catalogCategories…");
  await writeBatch(
    "catalogCategories",
    categories as unknown as Array<{ id: string } & Record<string, unknown>>
  );

  console.log("Upserting catalogProducts…");
  await writeBatch(
    "catalogProducts",
    products as unknown as Array<{ id: string } & Record<string, unknown>>
  );

  await db.collection("catalogImports").doc(importDoc.id).set(
    {
      ...importDoc,
      status: "completed",
      finishedAt: now,
    },
    { merge: true }
  );
}

async function main() {
  const { commit, source } = parseArgs(process.argv);

  if (!existsSync(source)) {
    console.error(`Source file not found: ${source}`);
    process.exit(1);
  }

  console.log(`Parsing source: ${source}`);
  const parsed = parseBucoSourceFile(source);
  console.log(
    `Format=${parsed.format} products=${parsed.products.length} sourceCategories=${parsed.categoryCount}`
  );

  const built = buildElectricalCatalogFromProducts({
    products: parsed.products,
    sourceFile: source,
  });

  mkdirSync(dirname(REPORT_PATH), { recursive: true });
  writeFileSync(REPORT_PATH, JSON.stringify(built.report, null, 2), "utf8");
  console.log(`Report written: ${REPORT_PATH}`);
  console.log(
    `Categories=${built.categories.length} Products=${built.products.length} ` +
      `active=${built.importDoc.productsValid} needs_review=${built.importDoc.productsNeedingReview} ` +
      `unmatched_sample=${built.report.unmatchedProducts.length}`
  );

  if (!commit) {
    console.log("Dry-run complete — no Firestore writes.");
    built.importDoc.status = "dry_run";
    return;
  }

  console.log(`COMMIT mode — project ${FIREBASE_PROJECT}`);
  const admin = initAdmin();
  try {
    await commitToFirestore(
      admin,
      built.categories,
      built.products,
      built.importDoc
    );
    console.log("Import completed (upsert, no deletes).");
  } catch (e) {
    console.error("Import failed:", e);
    try {
      const db = admin.firestore();
      await db.collection("catalogImports").doc(built.importDoc.id).set(
        {
          ...built.importDoc,
          status: "failed",
          finishedAt: admin.firestore.FieldValue.serverTimestamp(),
        },
        { merge: true }
      );
    } catch {
      /* ignore */
    }
    process.exit(1);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
