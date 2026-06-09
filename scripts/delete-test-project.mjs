/**
 * One-off: delete AI test project and report linked customer usage.
 * Usage: node scripts/delete-test-project.mjs
 */
import { createRequire } from "module";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const require = createRequire(import.meta.url);
const __dirname = dirname(fileURLToPath(import.meta.url));
const admin = require(join(__dirname, "../functions/node_modules/firebase-admin"));

const FIREBASE_PROJECT = "staveto-mvp-5f251";
const TEST_PROJECT_ID = "C3vmZfMQhDOJB7X6r8D1";
const SUBCOLLECTIONS = [
  "tasks",
  "materials",
  "materialSuggestions",
  "quoteItems",
  "expenses",
  "documents",
  "activity",
];

const CUSTOMER_SEARCH = {
  name: "Markus Keller",
  email: "mkeller@keller-immobilien.ch",
  company: "Keller Immobilien AG",
};

if (!admin.apps.length) {
  admin.initializeApp({ projectId: FIREBASE_PROJECT });
}

const db = admin.firestore();

async function deleteCollection(path) {
  const snap = await db.collection(path).get();
  if (snap.empty) return 0;
  const batch = db.batch();
  snap.docs.forEach((d) => batch.delete(d.ref));
  await batch.commit();
  return snap.size;
}

async function deleteSubcollections(projectId) {
  let total = 0;
  for (const sub of SUBCOLLECTIONS) {
    const count = await deleteCollection(`projects/${projectId}/${sub}`);
    if (count > 0) console.log(`  deleted ${count} from ${sub}`);
    total += count;
  }
  return total;
}

async function checkCustomer(projectCustomerId) {
  console.log("\n--- Customer check ---");
  const byEmail = await db
    .collection("customers")
    .where("email", "==", CUSTOMER_SEARCH.email)
    .limit(5)
    .get();
  const byCompany = await db
    .collection("customers")
    .where("companyName", "==", CUSTOMER_SEARCH.company)
    .limit(5)
    .get();

  const candidates = new Map();
  for (const snap of [byEmail, byCompany]) {
    snap.docs.forEach((d) => candidates.set(d.id, d.data()));
  }

  if (candidates.size === 0) {
    console.log("No customer found for Keller Immobilien / mkeller@keller-immobilien.ch");
    return;
  }

  for (const [id, data] of candidates) {
    const projectsSnap = await db
      .collection("projects")
      .where("customerId", "==", id)
      .limit(10)
      .get();
    const otherProjects = projectsSnap.docs.filter((d) => d.id !== TEST_PROJECT_ID);
    console.log(`Customer ${id}:`, {
      name: data.name ?? data.contactPersonName,
      companyName: data.companyName,
      email: data.email,
      linkedProjects: projectsSnap.size,
      otherProjects: otherProjects.map((d) => d.id),
    });
    if (otherProjects.length === 0 && id !== projectCustomerId) {
      console.log(`  → Not used elsewhere; safe to delete manually if desired (NOT auto-deleted).`);
    } else if (otherProjects.length > 0) {
      console.log(`  → Used by other projects; do NOT delete.`);
    }
  }
}

async function main() {
  const projectRef = db.doc(`projects/${TEST_PROJECT_ID}`);
  const projectSnap = await projectRef.get();

  if (!projectSnap.exists) {
    console.log(`Project ${TEST_PROJECT_ID} not found (already deleted?).`);
    await checkCustomer(undefined);
    return;
  }

  const data = projectSnap.data();
  console.log("Deleting project:", data?.name ?? TEST_PROJECT_ID);
  console.log("Brief:", (data?.customerRequest ?? "").slice(0, 120));

  const subCount = await deleteSubcollections(TEST_PROJECT_ID);
  await projectRef.delete();
  console.log(`Deleted project ${TEST_PROJECT_ID} (+ ${subCount} subcollection docs)`);

  await checkCustomer(data?.customerId);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
