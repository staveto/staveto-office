/**
 * Onboarding writes — all Firestore updates for the web wizard.
 */
import { doc, setDoc, serverTimestamp } from "@/lib/firebase";
import { getFirestoreInstance } from "@/lib/firebase";
import { upsertUserProfile, getUserProfile, type UserProfile } from "@/lib/userProfile";
import { createOrganization } from "@/lib/organizations";
import {
  persistActiveWorkspaceId,
  clearExplicitPersonalWorkspace,
} from "@/services/workspace/workspaceService";

export type OnboardingUsageType = "personal" | "company";
export type OnboardingWorkspaceType = "personal" | "company";

export type OnboardingFeature =
  | "quotes"
  | "projects"
  | "attendance"
  | "expenses"
  | "documents"
  | "team"
  | "calendar"
  | "invoices";

export type OnboardingRole = "craftsman" | "manager" | "accountant" | "other";

export const ONBOARDING_FEATURE_IDS: OnboardingFeature[] = [
  "quotes",
  "projects",
  "attendance",
  "expenses",
  "documents",
  "team",
  "calendar",
  "invoices",
];

export type PersonalProfileInput = {
  firstName: string;
  lastName: string;
  role: OnboardingRole;
};

export type FinishOnboardingInput = {
  usageType: OnboardingUsageType;
  selectedFeatures: OnboardingFeature[];
  activeWorkspaceId: string;
  activeWorkspaceType: OnboardingWorkspaceType;
};

export function buildDisplayName(firstName: string, lastName: string): string {
  return [firstName.trim(), lastName.trim()].filter(Boolean).join(" ");
}

export async function savePersonalProfile(
  uid: string,
  input: PersonalProfileInput
): Promise<void> {
  const displayName = buildDisplayName(input.firstName, input.lastName);
  await upsertUserProfile(uid, {
    firstName: input.firstName.trim(),
    lastName: input.lastName.trim(),
    displayName,
    onboarding: {
      role: input.role,
    },
  });
}

export async function saveOnboardingDraft(
  uid: string,
  partial: NonNullable<UserProfile["onboarding"]>
): Promise<void> {
  await upsertUserProfile(uid, { onboarding: partial });
}

export async function createCompanyForOnboarding(
  ownerUid: string,
  companyName: string
): Promise<string> {
  const orgId = await createOrganization(ownerUid, companyName.trim());
  const db = getFirestoreInstance();
  if (db) {
    await setDoc(
      doc(db, "organizations", orgId),
      {
        onboardingSource: "web",
        updatedAt: serverTimestamp(),
      },
      { merge: true }
    );
  }
  return orgId;
}

export async function finishOnboarding(
  uid: string,
  input: FinishOnboardingInput
): Promise<void> {
  const existing = await getUserProfile(uid);
  const existingOnb = existing?.onboarding ?? {};

  await upsertUserProfile(uid, {
    onboarding: {
      ...existingOnb,
      usageType: input.usageType,
      selectedFeatures: input.selectedFeatures,
      activeWorkspaceId: input.activeWorkspaceId,
      activeWorkspaceType: input.activeWorkspaceType,
      completed: true,
      completedAt: serverTimestamp(),
      source: "web",
    },
  });

  persistActiveWorkspaceId(input.activeWorkspaceId);
  if (input.activeWorkspaceType === "company") {
    clearExplicitPersonalWorkspace();
  }
}

/** After `/join?token=` — preserve existing onboarding fields, set company workspace. */
export async function finishOnboardingAfterJoin(
  uid: string,
  orgId: string
): Promise<void> {
  const existing = await getUserProfile(uid);
  const existingOnb = existing?.onboarding ?? {};

  await upsertUserProfile(uid, {
    onboarding: {
      ...existingOnb,
      usageType: "company",
      activeWorkspaceId: orgId,
      activeWorkspaceType: "company",
      completed: true,
      completedAt: serverTimestamp(),
      source: "web",
    },
  });

  persistActiveWorkspaceId(orgId);
}

export function getPersonalActiveWorkspaceId(): string {
  return "personal";
}
