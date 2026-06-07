/**
 * Onboarding writes — web B2B-first wizard (company_owner | join_company | solo).
 */
import {
  upsertUserProfile,
  getUserProfile,
  isOnboardingCompleted,
  type UserProfile,
} from "@/lib/userProfile";
import type {
  WebOnboardingPath,
  PrimaryUsageMode,
  PersonalPlanChoice,
  BillingPeriod,
  BusinessPlanCode,
  TeamSizeBand,
  CompanyType,
} from "@/lib/onboardingTypes";
import { resolveTimezoneForCountry } from "@/lib/onboardingTypes";
import type { WorkType } from "@/lib/workTypes";
import {
  persistActiveWorkspaceId,
  clearExplicitPersonalWorkspace,
  markExplicitPersonalWorkspace,
} from "@/services/workspace/workspaceService";
import {
  createBusinessOrg,
  type CreateBusinessOrgInput,
} from "@/services/business/createBusinessOrgService";
import { getUserOrgMemberships } from "@/lib/organizations";
import { serverTimestamp } from "@/lib/firebase";
import {
  CONSENT_PRIVACY_VERSION,
  CONSENT_TERMS_VERSION,
} from "@/lib/consent";
import type { Locale } from "@/i18n/translations";

export type {
  WebOnboardingPath,
  PrimaryUsageMode,
} from "@/lib/onboardingTypes";

/** @deprecated */
export type MobileOnboardingPath = WebOnboardingPath;
export type OnboardingPath = WebOnboardingPath;
export type OnboardingUsageType = "personal" | "company";
export type OnboardingWorkspaceType = "personal" | "company";

export type SoloOnboardingInput = {
  primaryUsageMode: PrimaryUsageMode;
  primaryCountry: string;
  timezone?: string;
  firstName?: string;
  lastName?: string;
  phoneE164?: string;
  personalPlan?: PersonalPlanChoice;
  skippedFirstProject?: boolean;
  skippedFirstEquipment?: boolean;
};

export type CompanyOwnerOnboardingInput = CreateBusinessOrgInput;

export type MinimalProfileInput = {
  firstName?: string;
  lastName?: string;
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

export async function saveOnboardingTermsAcceptance(
  uid: string,
  locale: Locale = "sk"
): Promise<void> {
  const acceptedAt = serverTimestamp();
  await upsertUserProfile(uid, {
    termsAcceptedAt: acceptedAt,
    privacyAcceptedAt: acceptedAt,
    termsVersion: CONSENT_TERMS_VERSION,
    privacyVersion: CONSENT_PRIVACY_VERSION,
    consentLocale: locale,
    onboarding: {
      termsAcceptedAt: acceptedAt,
      privacyAcceptedAt: acceptedAt,
      termsVersion: CONSENT_TERMS_VERSION,
      privacyVersion: CONSENT_PRIVACY_VERSION,
      consentLocale: locale,
      source: "web",
    },
  });
}

export async function saveOnboardingPathChoice(
  uid: string,
  path: WebOnboardingPath
): Promise<void> {
  await upsertUserProfile(uid, {
    onboarding: {
      path,
      source: "web",
      usageType: path === "solo" ? "personal" : "company",
    },
  });
}

export async function saveJoinCompanyIntent(uid: string): Promise<void> {
  await saveOnboardingPathChoice(uid, "join_company");
}

async function resolveOwnedBusinessOrgId(
  uid: string,
  orgIdHints: string[] = []
): Promise<string | null> {
  const memberships = await getUserOrgMemberships(uid, { orgIdHints });
  return memberships.find((m) => m.role === "owner")?.orgId ?? null;
}

function isDuplicateBusinessOrgError(err: unknown): boolean {
  const e = err as { code?: string; message?: string };
  return (
    e?.code === "functions/failed-precondition" ||
    e?.code === "failed-precondition" ||
    (typeof e?.message === "string" &&
      e.message.toLowerCase().includes("already have a business organization"))
  );
}

export async function completeCompanyOwnerOnboarding(
  uid: string,
  input: CompanyOwnerOnboardingInput
): Promise<{ orgId: string; alreadyCompleted?: boolean }> {
  const existing = await getUserProfile(uid);

  if (isOnboardingCompleted(existing)) {
    const orgId =
      existing?.activeBusinessOrgId ??
      existing?.onboarding?.activeWorkspaceId ??
      "";
    if (orgId) {
      persistActiveWorkspaceId(orgId);
      clearExplicitPersonalWorkspace();
    }
    return { orgId, alreadyCompleted: true };
  }

  const existingOrgId = existing?.activeBusinessOrgId?.trim();
  if (existingOrgId) {
    await writeOnboardingCompletion(
      uid,
      {
        path: "company_owner",
        usageType: "company",
        activeWorkspaceId: existingOrgId,
        activeWorkspaceType: "business",
        teamSizeBand: input.teamSizeBand,
        businessPlanCode: input.planCode,
        billingPeriod: input.billingPeriod,
      },
      {
        activeBusinessOrgId: existingOrgId,
        primaryCountry: input.country,
        timezone: input.timezone ?? resolveTimezoneForCountry(input.country),
      }
    );

    persistActiveWorkspaceId(existingOrgId);
    clearExplicitPersonalWorkspace();
    return { orgId: existingOrgId };
  }

  const orgIdHints: string[] = [];
  const ownedOrgId = await resolveOwnedBusinessOrgId(uid, orgIdHints);
  if (ownedOrgId) {
    await writeOnboardingCompletion(
      uid,
      {
        path: "company_owner",
        usageType: "company",
        activeWorkspaceId: ownedOrgId,
        activeWorkspaceType: "business",
        teamSizeBand: input.teamSizeBand,
        businessPlanCode: input.planCode,
        billingPeriod: input.billingPeriod,
      },
      {
        activeBusinessOrgId: ownedOrgId,
        primaryCountry: input.country,
        timezone: input.timezone ?? resolveTimezoneForCountry(input.country),
      }
    );
    persistActiveWorkspaceId(ownedOrgId);
    clearExplicitPersonalWorkspace();
    return { orgId: ownedOrgId };
  }

  let createdOrgId: string;
  try {
    const result = await createBusinessOrg(uid, input);
    createdOrgId = result.orgId;
  } catch (err) {
    if (!isDuplicateBusinessOrgError(err)) throw err;
    const recoveredOrgId = await resolveOwnedBusinessOrgId(uid, orgIdHints);
    if (!recoveredOrgId) throw err;
    createdOrgId = recoveredOrgId;
  }

  await writeOnboardingCompletion(
    uid,
    {
      path: "company_owner",
      usageType: "company",
      activeWorkspaceId: createdOrgId,
      activeWorkspaceType: "business",
      teamSizeBand: input.teamSizeBand,
      businessPlanCode: input.planCode,
      billingPeriod: input.billingPeriod,
    },
    {
      activeBusinessOrgId: createdOrgId,
      primaryCountry: input.country,
      timezone: input.timezone ?? resolveTimezoneForCountry(input.country),
    }
  );

  persistActiveWorkspaceId(createdOrgId);
  clearExplicitPersonalWorkspace();

  return { orgId: createdOrgId };
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

export function defaultWorkTypeForUsageMode(mode: PrimaryUsageMode): WorkType {
  return mode === "build" ? "customer_job" : "service_inspection";
}

export async function completeSoloOnboarding(
  uid: string,
  input: SoloOnboardingInput
): Promise<void> {
  const timezone =
    input.timezone?.trim() || resolveTimezoneForCountry(input.primaryCountry);
  const displayName = buildOptionalDisplayName(input);

  const activeWorkspaceId = getPersonalActiveWorkspaceId();
  await writeOnboardingCompletion(
    uid,
    {
      path: "solo",
      usageType: "personal",
      activeWorkspaceId,
      activeWorkspaceType: "personal",
      personalPlan: input.personalPlan ?? "free",
      skippedFirstProject: input.skippedFirstProject ?? false,
      skippedFirstEquipment: input.skippedFirstEquipment ?? false,
    },
    {
      primaryUsageMode: input.primaryUsageMode,
      primaryCountry: input.primaryCountry,
      timezone,
      ...(input.firstName?.trim() ? { firstName: input.firstName.trim() } : {}),
      ...(input.lastName?.trim() ? { lastName: input.lastName.trim() } : {}),
      ...(displayName ? { displayName } : {}),
      ...(input.phoneE164?.trim() ? { phoneE164: input.phoneE164.trim() } : {}),
    }
  );

  persistActiveWorkspaceId(activeWorkspaceId);
  markExplicitPersonalWorkspace();
}

export async function completePersonalOnboarding(
  uid: string,
  input: MinimalProfileInput = {}
): Promise<void> {
  await completeSoloOnboarding(uid, {
    primaryUsageMode: "build",
    primaryCountry: "SK",
    personalPlan: "free",
    ...input,
    skippedFirstProject: true,
    skippedFirstEquipment: true,
  });
}

export async function completeWorkerJoinIntent(uid: string): Promise<void> {
  return saveJoinCompanyIntent(uid);
}

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
      path: "join_company",
      usageType: "company",
      activeWorkspaceId: orgId,
      activeWorkspaceType: "business",
      completed: true,
      completedAt: serverTimestamp(),
      source: "web",
    },
  });

  persistActiveWorkspaceId(orgId);
  clearExplicitPersonalWorkspace();
}

export async function dismissBusinessSetupChecklist(uid: string): Promise<void> {
  await upsertUserProfile(uid, {
    onboarding: { businessChecklistDismissed: true },
  });
}

export function getPersonalActiveWorkspaceId(): string {
  return "personal";
}

export const BUSINESS_CREATE_ROUTE = "/app/business/create";
export const COMPANY_REGISTRATION_ROUTE = BUSINESS_CREATE_ROUTE;

export function userNeedsCompanyRegistration(): boolean {
  return false;
}

export function shouldShowBusinessSetupChecklist(
  profile: UserProfile | null
): boolean {
  return (
    isOnboardingCompleted(profile) &&
    profile?.onboarding?.path === "company_owner" &&
    !profile?.onboarding?.businessChecklistDismissed
  );
}

export { isOnboardingCompleted };
