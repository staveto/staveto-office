/**
 * Onboarding writes — all Firestore updates for the web wizard.
 */
import { doc, setDoc, serverTimestamp } from "@/lib/firebase";
import { getFirestoreInstance } from "@/lib/firebase";
import { upsertUserProfile, getUserProfile, isOnboardingCompleted, type UserProfile } from "@/lib/userProfile";
import { createOrganization } from "@/lib/organizations";
import {
  persistActiveWorkspaceId,
  clearExplicitPersonalWorkspace,
  markExplicitPersonalWorkspace,
} from "@/services/workspace/workspaceService";

export type OnboardingUsageType = "personal" | "company";
export type OnboardingWorkspaceType = "personal" | "company";
export type OnboardingPath = "company_owner" | "worker_join" | "personal";

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

export type MinimalProfileInput = {
  firstName?: string;
  lastName?: string;
};

export type FinishOnboardingInput = {
  usageType: OnboardingUsageType;
  selectedFeatures?: OnboardingFeature[];
  activeWorkspaceId: string;
  activeWorkspaceType: OnboardingWorkspaceType;
};

export function buildDisplayName(firstName: string, lastName: string): string {
  return [firstName.trim(), lastName.trim()].filter(Boolean).join(" ");
}

function buildOptionalDisplayName(input: MinimalProfileInput): string | undefined {
  const displayName = buildDisplayName(input.firstName ?? "", input.lastName ?? "");
  return displayName || undefined;
}

async function writeOnboardingCompletion(
  uid: string,
  onboardingPatch: NonNullable<UserProfile["onboarding"]>,
  profilePatch: Partial<UserProfile> = {}
): Promise<void> {
  const existing = await getUserProfile(uid);
  const existingOnb = existing?.onboarding ?? {};

  await upsertUserProfile(uid, {
    ...profilePatch,
    onboardingCompletedAt: serverTimestamp(),
    onboarding: {
      ...existingOnb,
      ...onboardingPatch,
      completed: true,
      completedAt: serverTimestamp(),
      source: "web",
    },
  });
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

export async function saveMinimalProfile(
  uid: string,
  input: MinimalProfileInput
): Promise<void> {
  const patch: Partial<UserProfile> = {};
  if (input.firstName?.trim()) patch.firstName = input.firstName.trim();
  if (input.lastName?.trim()) patch.lastName = input.lastName.trim();
  const displayName = buildOptionalDisplayName(input);
  if (displayName) patch.displayName = displayName;
  if (Object.keys(patch).length > 0) {
    await upsertUserProfile(uid, patch);
  }
}

export async function saveOnboardingDraft(
  uid: string,
  partial: NonNullable<UserProfile["onboarding"]>
): Promise<void> {
  await upsertUserProfile(uid, { onboarding: partial });
}

/** Legacy — creates org during onboarding. Prefer settings/dashboard registration. */
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

/**
 * Flow A — company owner: minimal profile, no org creation in onboarding.
 * User lands in personal workspace until company registration completes elsewhere.
 */
export async function completeCompanyOwnerOnboarding(
  uid: string,
  input: MinimalProfileInput = {}
): Promise<void> {
  await saveMinimalProfile(uid, input);

  const activeWorkspaceId = getPersonalActiveWorkspaceId();
  await writeOnboardingCompletion(uid, {
    usageType: "company",
    activeWorkspaceId,
    activeWorkspaceType: "personal",
  });

  persistActiveWorkspaceId(activeWorkspaceId);
  markExplicitPersonalWorkspace();
}

/**
 * Flow B — worker join intent: persist choice before redirect to /join.
 * Completion happens in finishOnboardingAfterJoin after invite accept.
 */
export async function completeWorkerJoinIntent(uid: string): Promise<void> {
  await saveOnboardingDraft(uid, {
    usageType: "company",
    source: "web",
  });
}

/** Flow C — solo personal usage. */
export async function completePersonalOnboarding(
  uid: string,
  input: MinimalProfileInput = {}
): Promise<void> {
  await saveMinimalProfile(uid, input);

  const activeWorkspaceId = getPersonalActiveWorkspaceId();
  await writeOnboardingCompletion(uid, {
    usageType: "personal",
    activeWorkspaceId,
    activeWorkspaceType: "personal",
  });

  persistActiveWorkspaceId(activeWorkspaceId);
  markExplicitPersonalWorkspace();
}

/** @deprecated Use path-specific complete* helpers. Kept for compatibility. */
export async function finishOnboarding(
  uid: string,
  input: FinishOnboardingInput
): Promise<void> {
  const existing = await getUserProfile(uid);
  const existingOnb = existing?.onboarding ?? {};

  await upsertUserProfile(uid, {
    ...(input.activeWorkspaceType === "company" &&
    input.activeWorkspaceId !== "personal"
      ? { activeBusinessOrgId: input.activeWorkspaceId }
      : {}),
    onboardingCompletedAt: serverTimestamp(),
    onboarding: {
      ...existingOnb,
      usageType: input.usageType,
      selectedFeatures: input.selectedFeatures ?? [],
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
  } else {
    markExplicitPersonalWorkspace();
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
    activeBusinessOrgId: orgId,
    onboardingCompletedAt: serverTimestamp(),
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
  clearExplicitPersonalWorkspace();
}

export function getPersonalActiveWorkspaceId(): string {
  return "personal";
}

/** Safe route for company registration when a dedicated flow is unavailable. */
export const COMPANY_REGISTRATION_ROUTE = "/app/settings";

export function userNeedsCompanyRegistration(
  profile: UserProfile | null,
  hasCompanyWorkspace: boolean
): boolean {
  return (
    isOnboardingCompleted(profile) &&
    profile?.onboarding?.usageType === "company" &&
    !hasCompanyWorkspace
  );
}
