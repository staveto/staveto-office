/**
 * Phase 1.2 — read-only workspace duplicate review (CLI).
 * Usage:
 *   node scripts/run-workspace-diagnostics.mjs
 *   node scripts/run-workspace-diagnostics.mjs --email user@example.com
 *   node scripts/run-workspace-diagnostics.mjs --uid FIREBASE_UID
 *
 * No writes. No deletes. No merges.
 */
import { createRequire } from "module";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import { readFileSync, existsSync } from "fs";

const require = createRequire(import.meta.url);
const __dirname = dirname(fileURLToPath(import.meta.url));
const admin = require(join(__dirname, "../functions/node_modules/firebase-admin"));

const FIREBASE_PROJECT = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID?.trim() || "staveto-mvp-5f251";

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
  let email = null;
  let uid = null;
  let discoverStaveto = false;
  for (let i = 2; i < argv.length; i++) {
    if (argv[i] === "--email" && argv[i + 1]) email = argv[++i].trim();
    if (argv[i] === "--uid" && argv[i + 1]) uid = argv[++i].trim();
    if (argv[i] === "--discover-staveto") discoverStaveto = true;
  }
  return { email, uid, discoverStaveto };
}

function normalizeOrgLabel(value) {
  return (value ?? "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ")
    .replace(/\.(s\.r\.o\.|spol\.\s*s\s*r\.o\.)/gi, " sro");
}

function formatTs(raw) {
  if (!raw) return null;
  if (typeof raw.toDate === "function") {
    try {
      return raw.toDate().toISOString();
    } catch {
      return null;
    }
  }
  if (typeof raw === "string") return raw;
  return null;
}

function countProfileFields(profile) {
  if (!profile || typeof profile !== "object") return 0;
  return Object.entries(profile).filter(
    ([k, v]) => k !== "logoStoragePath" && String(v ?? "").trim()
  ).length;
}

function scoreOrg(row) {
  let score = 0;
  score += row.projectsCount * 100;
  score += (row.membersCount ?? 0) * 10;
  score += row.profileFieldCount * 5;
  if (row.matchesLastActiveWorkspace) score += 80;
  if (row.matchesActiveBusinessOrg) score += 60;
  if (row.isOwner) score += 20;
  if (row.source?.includes("business") || row.source === "onboarding") score += 15;
  if (!row.source || row.source === "web") score -= 10;
  if (row.projectsCount === 0 && (row.membersCount ?? 0) <= 1 && row.profileFieldCount <= 1) {
    score -= 25;
  }
  return score;
}

function initAdmin() {
  loadEnvLocal();
  if (admin.apps.length) return admin.app();

  const raw = process.env.FIREBASE_SERVICE_ACCOUNT_JSON?.trim();
  if (raw) {
    try {
      const sa = JSON.parse(raw);
      return admin.initializeApp({
        credential: admin.credential.cert(sa),
        projectId: FIREBASE_PROJECT,
      });
    } catch (e) {
      console.warn("FIREBASE_SERVICE_ACCOUNT_JSON parse failed, trying ADC:", e.message);
    }
  }

  return admin.initializeApp({ projectId: FIREBASE_PROJECT });
}

async function resolveUid(auth, { email, uid }) {
  if (uid) return uid;
  if (email) {
    const user = await auth.getUserByEmail(email);
    return user.uid;
  }
  return null;
}

async function loadUserProfile(db, uid) {
  const snap = await db.doc(`users/${uid}`).get();
  if (!snap.exists) return {};
  return snap.data() ?? {};
}

async function loadOrgProfile(db, orgId) {
  const snap = await db.doc(`organizations/${orgId}`).get();
  if (!snap.exists) return { org: null, profile: null };
  const data = snap.data() ?? {};
  const profile =
    data.profile && typeof data.profile === "object" ? data.profile : null;
  return { org: data, profile };
}

async function countOrgProjects(db, orgId) {
  const snap = await db.collection("projects").where("orgId", "==", orgId).limit(200).get();
  return snap.size;
}

async function countOrgMembers(db, orgId) {
  const snap = await db.collection(`organizations/${orgId}/members`).limit(100).get();
  return snap.size;
}

async function listMembershipOrgIds(db, uid) {
  const ids = new Set();

  const owned = await db.collection("organizations").where("ownerUid", "==", uid).get();
  for (const doc of owned.docs) ids.add(doc.id);

  try {
    const cg = await db.collectionGroup("members").where("userId", "==", uid).get();
    for (const doc of cg.docs) {
      const parts = doc.ref.path.split("/");
      const orgIndex = parts.indexOf("organizations");
      if (orgIndex >= 0 && parts[orgIndex + 1]) ids.add(parts[orgIndex + 1]);
    }
  } catch (e) {
    console.warn("collectionGroup members query failed (index/rules):", e.message);
  }

  return [...ids];
}

async function buildOrgRow(db, orgId, uid, hints) {
  const { org, profile } = await loadOrgProfile(db, orgId);
  const [projectsCount, membersCount] = await Promise.all([
    countOrgProjects(db, orgId),
    countOrgMembers(db, orgId),
  ]);

  const legalName = profile?.legalName?.trim() || null;
  const name = legalName || org?.name?.trim() || orgId;
  const profileFieldCount = countProfileFields(profile);
  const isOwner = org?.ownerUid === uid;

  const row = {
    orgId,
    name,
    legalName,
    ownerUid: org?.ownerUid ?? null,
    createdAt: formatTs(org?.createdAt),
    source: typeof org?.source === "string" ? org.source : null,
    country: profile?.country?.trim() || profile?.countryCode?.trim() || null,
    membersCount,
    projectsCount,
    profileFieldCount,
    isOwner,
    isMember: true,
    matchesLastActiveWorkspace: hints.lastActive === orgId,
    matchesActiveBusinessOrg: hints.activeBusinessOrg === orgId,
  };

  row.canonicalScore = scoreOrg(row);
  row.appearsEmpty =
    row.projectsCount === 0 && row.membersCount <= 1 && row.profileFieldCount <= 1;
  row.hasImportantData =
    row.projectsCount > 0 || row.membersCount > 1 || row.profileFieldCount >= 3;

  return row;
}

async function discoverStavetoOwnerUid(db) {
  const snap = await db.collection("organizations").limit(500).get();
  const stavetoOrgs = [];
  for (const doc of snap.docs) {
    const data = doc.data() ?? {};
    const name = String(data.name ?? "").toLowerCase();
    const profile = data.profile && typeof data.profile === "object" ? data.profile : null;
    const legal = String(profile?.legalName ?? "").toLowerCase();
    if (name.includes("staveto") || legal.includes("staveto")) {
      stavetoOrgs.push({ orgId: doc.id, ownerUid: data.ownerUid ?? null, name: data.name });
    }
  }
  const owners = [...new Set(stavetoOrgs.map((o) => o.ownerUid).filter(Boolean))];
  return { stavetoOrgs, owners };
}

async function main() {
  const args = parseArgs(process.argv);
  initAdmin();
  const db = admin.firestore();
  const auth = admin.auth();

  let uid = await resolveUid(auth, args);
  let userEmail = args.email ?? null;

  if (!uid && args.discoverStaveto) {
    const { stavetoOrgs, owners } = await discoverStavetoOwnerUid(db);
    console.error(`[discover] Found ${stavetoOrgs.length} Staveto-related org(s), ${owners.length} owner uid(s).`);
    if (owners.length === 1) {
      uid = owners[0];
      console.error(`[discover] Using owner uid: ${uid}`);
    } else if (owners.length > 1) {
      console.error("[discover] Multiple owners — pass --uid explicitly. Owners:", owners.join(", "));
      console.log(JSON.stringify({ stavetoOrgs, owners }, null, 2));
      process.exit(0);
    } else {
      console.log(JSON.stringify({ stavetoOrgs, owners }, null, 2));
      process.exit(0);
    }
  }

  if (uid && !userEmail) {
    try {
      const user = await auth.getUser(uid);
      userEmail = user.email ?? null;
    } catch {
      /* optional */
    }
  }

  if (!uid) {
    console.error(
      "Provide --email, --uid, or --discover-staveto.\nExample: node scripts/run-workspace-diagnostics.mjs --discover-staveto"
    );
    process.exit(1);
  }

  const userProfile = await loadUserProfile(db, uid);
  const hints = {
    lastActive:
      typeof userProfile.lastActiveWorkspaceId === "string" &&
      userProfile.lastActiveWorkspaceId !== "personal"
        ? userProfile.lastActiveWorkspaceId.trim()
        : null,
    activeBusinessOrg:
      typeof userProfile.activeBusinessOrgId === "string"
        ? userProfile.activeBusinessOrgId.trim()
        : null,
  };

  const orgIds = await listMembershipOrgIds(db, uid);
  const organizations = [];
  for (const orgId of orgIds) {
    organizations.push(await buildOrgRow(db, orgId, uid, hints));
  }

  organizations.sort((a, b) => b.canonicalScore - a.canonicalScore);

  const duplicateGroups = new Map();
  for (const row of organizations.filter((o) => o.isOwner)) {
    const key = `${normalizeOrgLabel(row.legalName || row.name)}::${row.ownerUid ?? "?"}`;
    const list = duplicateGroups.get(key) ?? [];
    list.push(row);
    duplicateGroups.set(key, list);
  }

  const groups = [...duplicateGroups.entries()]
    .filter(([, rows]) => rows.length > 1)
    .map(([groupKey, rows]) => {
      const sorted = [...rows].sort((a, b) => b.canonicalScore - a.canonicalScore);
      const winner = sorted[0];
      const bothHaveData = sorted.filter((r) => r.hasImportantData).length >= 2;
      return {
        groupKey,
        displayLabel: winner.name,
        orgIds: sorted.map((r) => r.orgId),
        canonicalOrgId: winner.orgId,
        canonicalReason: `score=${winner.canonicalScore}; projects=${winner.projectsCount}; members=${winner.membersCount}; profileFields=${winner.profileFieldCount}; source=${winner.source ?? "—"}`,
        riskLevel: bothHaveData ? "high" : "medium",
        orgs: sorted,
      };
    });

  const canonical = organizations.filter((o) => o.isOwner)[0] ?? organizations[0] ?? null;

  const report = {
    generatedAt: new Date().toISOString(),
    userId: uid,
    userEmail,
    activeWorkspaceId: hints.activeBusinessOrg || hints.lastActive,
    lastActiveWorkspaceId: hints.lastActive,
    activeBusinessOrgId: hints.activeBusinessOrg,
    organizationCount: organizations.length,
    organizations,
    ownedOrganizations: organizations.filter((o) => o.isOwner),
    memberOrganizations: organizations.filter((o) => !o.isOwner),
    duplicateGroups: groups,
    switcherDuplicateExplanation:
      groups.length > 0
        ? `${groups[0].orgs.length} separate org documents share label "${groups[0].displayLabel}" — different orgIds, same name.`
        : organizations.length > 1
          ? "Multiple company orgs; no duplicate name group among owned orgs."
          : null,
    canonicalOrganizationId: groups[0]?.canonicalOrgId ?? canonical?.orgId ?? null,
    canonicalOrganizationReason:
      groups[0]?.canonicalReason ??
      (canonical
        ? `Highest score among accessible orgs (${canonical.projectsCount} projects).`
        : null),
    duplicateOrganizationWarning:
      groups.length > 0
        ? `Found ${groups.length} duplicate group(s). Manual review only — no data changed.`
        : null,
    noAutomaticDeletion: true,
    manualCleanupPlan: [
      "Compare both orgId rows below in Firebase Console — do not delete yet.",
      "Switch workspace in app header to each orgId and verify projects.",
      "Phase 2+ only: merge/archive non-canonical org after explicit approval.",
    ],
  };

  console.log(JSON.stringify(report, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
