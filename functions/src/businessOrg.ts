import * as admin from "firebase-admin";
import { FieldValue, Timestamp } from "firebase-admin/firestore";
import { HttpsError } from "firebase-functions/v2/https";
import { z } from "zod";

if (!admin.apps.length) {
  admin.initializeApp();
}

const db = admin.firestore();

const createBusinessOrgSchema = z.object({
  companyName: z.string().min(1).max(200),
  country: z.string().min(2).max(10),
  timezone: z.string().min(1).max(80).optional(),
  companyType: z.string().min(1).max(40),
  planCode: z.enum([
    "business_starter",
    "business_team",
    "business_company",
    "business_enterprise",
  ]),
  billingPeriod: z.enum(["monthly", "yearly"]),
  teamSizeBand: z.string().optional(),
});

const SEATS: Record<string, number> = {
  business_starter: 5,
  business_team: 15,
  business_company: 30,
  business_enterprise: 100,
};

const LEGACY_PLAN: Record<string, string> = {
  business_starter: "TEAM_5",
  business_team: "TEAM_15",
  business_company: "TEAM_30",
  business_enterprise: "TEAM_30",
};

const DUPLICATE_STATUSES = ["pending", "pending_payment", "trialing", "active"];

type EnabledModulesDoc = Record<string, boolean>;

function buildEnabledModulesForCompanyType(companyType: string): EnabledModulesDoc {
  const modules: EnabledModulesDoc = {
    jobs: true,
    quotes: true,
    team: true,
    documents: true,
    billing: true,
    planning: false,
    vehicles: false,
    equipment: false,
    expenses: false,
    reports: false,
    issues: false,
  };

  const type = companyType.trim().toLowerCase();
  const enable = (...keys: string[]) => {
    for (const key of keys) modules[key] = true;
  };

  switch (type) {
    case "hvac":
      enable("equipment", "vehicles");
      break;
    case "construction":
      enable("planning", "vehicles");
      break;
    case "electrical":
    case "plumbing":
      enable("equipment");
      if (type === "plumbing") enable("vehicles");
      break;
    case "roofing":
      enable("equipment", "vehicles");
      break;
    default:
      break;
  }

  return modules;
}

export type CreateBusinessOrgResult = {
  orgId: string;
  planCode: string;
  status: string;
  trialEndsAt: string;
};

async function assertNoDuplicateOwnerOrg(
  tx: FirebaseFirestore.Transaction,
  actorUid: string
): Promise<void> {
  const ownerOrgQuery = db
    .collection("organizations")
    .where("ownerUid", "==", actorUid)
    .limit(10);
  const ownedOrgSnap = await tx.get(ownerOrgQuery);
  const hasActiveOrg = ownedOrgSnap.docs.some((doc) => {
    const status = doc.data().status as string | undefined;
    return !status || DUPLICATE_STATUSES.includes(status);
  });
  if (hasActiveOrg) {
    throw new HttpsError(
      "failed-precondition",
      "You already have a business organization with active or pending status."
    );
  }
}

export async function handleCreateBusinessOrg(
  uid: string | undefined,
  actorEmail: string | null | undefined,
  data: unknown
): Promise<CreateBusinessOrgResult> {
  if (!uid) {
    throw new HttpsError("unauthenticated", "Authentication required.");
  }

  const input = createBusinessOrgSchema.parse(data);

  if (input.planCode === "business_enterprise") {
    throw new HttpsError(
      "failed-precondition",
      "Enterprise plans require contact with sales."
    );
  }

  const now = Timestamp.now();
  const trialEnds = Timestamp.fromMillis(now.toMillis() + 14 * 24 * 60 * 60 * 1000);
  const seatsLimit = SEATS[input.planCode] ?? 5;
  const timezone = input.timezone?.trim() || "Europe/Bratislava";

  const orgRef = db.collection("organizations").doc();
  const memberRef = orgRef.collection("members").doc(uid);
  const orgId = orgRef.id;

  await db.runTransaction(async (tx) => {
    await assertNoDuplicateOwnerOrg(tx, uid);

    tx.set(orgRef, {
      name: input.companyName.trim(),
      legalName: input.companyName.trim(),
      ownerUid: uid,
      billingOwnerUid: uid,
      createdByUid: uid,
      seatLimit: seatsLimit,
      seatsLimit,
      seatsUsed: 1,
      plan: LEGACY_PLAN[input.planCode] ?? "TEAM_5",
      planCode: input.planCode,
      billingPeriod: input.billingPeriod,
      selectedPlan: input.planCode,
      status: "trialing",
      billingStatus: "pending_payment",
      businessEnabled: true,
      companyType: input.companyType,
      enabledModules: buildEnabledModulesForCompanyType(input.companyType),
      countryCode: input.country,
      country: input.country,
      timezone,
      teamSizeBand: input.teamSizeBand ?? null,
      trialStartedAt: now,
      trialEndsAt: trialEnds,
      source: "web_onboarding",
      onboardingSource: "web",
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
      profile: {
        legalName: input.companyName.trim(),
        country: input.country,
      },
    });

    tx.set(memberRef, {
      role: "owner",
      userId: uid,
      email: actorEmail ?? null,
      status: "active",
      joinedAt: FieldValue.serverTimestamp(),
      createdAt: FieldValue.serverTimestamp(),
    });
  });

  return {
    orgId,
    planCode: input.planCode,
    status: "trialing",
    trialEndsAt: trialEnds.toDate().toISOString(),
  };
}
