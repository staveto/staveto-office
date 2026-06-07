import { getFirestoreInstance, doc, getDoc, setDoc, serverTimestamp } from "./firebase";
import type { WebOnboardingPath, PrimaryUsageMode, PersonalPlanChoice } from "./onboardingTypes";

export type UserProfile = {
  displayName?: string;
  email?: string;
  emailLower?: string;
  firstName?: string;
  lastName?: string;
  phoneE164?: string;
  /** Mobile-aligned build vs trade preference. */
  primaryUsageMode?: PrimaryUsageMode;
  primaryCountry?: string;
  timezone?: string;
  createdAt?: unknown;
  updatedAt?: unknown;
  /** Mobile BusinessContext hint (optional on users/{uid}). */
  activeBusinessOrgId?: string;
  /** Mobile-aligned completion marker — primary gate for web auth. */
  onboardingCompletedAt?: unknown;
  /** Mobile consent gate — top-level fields (aligned with ConsentRequiredScreen). */
  termsAcceptedAt?: unknown;
  privacyAcceptedAt?: unknown;
  termsVersion?: string;
  privacyVersion?: string;
  consentLocale?: string;
  welcomeGuide?: {
    dismissedAt?: unknown;
    lastOpenedModule?: string;
  };
  onboarding?: {
    purpose?: string;
    role?: string;
    teamSize?: string;
    inviteEmails?: { email: string; role: string }[];
    completed?: boolean;
    completedAt?: unknown;
    source?: "web" | "mobile" | string;
    /** Web/mobile path: company_owner | join_company | solo */
    path?: WebOnboardingPath;
    usageType?: "personal" | "company";
    selectedFeatures?: string[];
    activeWorkspaceId?: string;
    /** Web writes `business`; legacy/mobile may use `company`. */
    activeWorkspaceType?: "personal" | "company" | "business";
    /** Solo onboarding plan choice (not a workspace). */
    personalPlan?: PersonalPlanChoice;
    teamSizeBand?: string;
    businessPlanCode?: string;
    billingPeriod?: "monthly" | "yearly";
    businessChecklistDismissed?: boolean;
    termsAcceptedAt?: unknown;
    privacyAcceptedAt?: unknown;
    termsVersion?: string;
    privacyVersion?: string;
    consentLocale?: string;
    skippedFirstProject?: boolean;
    skippedFirstEquipment?: boolean;
  };
};

export async function getUserProfile(uid: string): Promise<UserProfile | null> {
  const dbInstance = getFirestoreInstance();
  if (!dbInstance) return null;
  const snap = await getDoc(doc(dbInstance, "users", uid));
  return snap.exists() ? (snap.data() as UserProfile) : null;
}

export async function upsertUserProfile(
  uid: string,
  data: Partial<UserProfile & { email: string; onboarding?: UserProfile["onboarding"] }>
): Promise<void> {
  const dbInstance = getFirestoreInstance();
  if (!dbInstance) throw new Error("Firestore not configured");
  const ref = doc(dbInstance, "users", uid);
  const snap = await getDoc(ref);
  const existing = snap.exists() ? (snap.data() as Record<string, unknown>) : {};
  const update: Record<string, unknown> = {
    updatedAt: serverTimestamp(),
  };
  if (data.email) {
    update.email = data.email.trim();
    update.emailLower = data.email.trim().toLowerCase();
  }
  if (data.displayName !== undefined) update.displayName = data.displayName;
  if (data.firstName !== undefined) update.firstName = data.firstName;
  if (data.lastName !== undefined) update.lastName = data.lastName;
  if (data.phoneE164 !== undefined) update.phoneE164 = data.phoneE164;
  if (data.primaryUsageMode !== undefined) update.primaryUsageMode = data.primaryUsageMode;
  if (data.primaryCountry !== undefined) update.primaryCountry = data.primaryCountry;
  if (data.timezone !== undefined) update.timezone = data.timezone;
  if (data.activeBusinessOrgId !== undefined) {
    update.activeBusinessOrgId = data.activeBusinessOrgId;
  }
  if (data.onboardingCompletedAt !== undefined) {
    update.onboardingCompletedAt = data.onboardingCompletedAt;
  }
  if (data.termsAcceptedAt !== undefined) update.termsAcceptedAt = data.termsAcceptedAt;
  if (data.privacyAcceptedAt !== undefined) update.privacyAcceptedAt = data.privacyAcceptedAt;
  if (data.termsVersion !== undefined) update.termsVersion = data.termsVersion;
  if (data.privacyVersion !== undefined) update.privacyVersion = data.privacyVersion;
  if (data.consentLocale !== undefined) update.consentLocale = data.consentLocale;
  if (data.welcomeGuide) {
    const existingGuide = (existing.welcomeGuide as Record<string, unknown>) ?? {};
    const guide = data.welcomeGuide as Record<string, unknown>;
    update.welcomeGuide = {
      ...existingGuide,
      ...Object.fromEntries(Object.entries(guide).filter(([, v]) => v !== undefined)),
    };
  }
  if (data.onboarding) {
    const existingOnb = (existing.onboarding as Record<string, unknown>) ?? {};
    const onb = data.onboarding as Record<string, unknown>;
    update.onboarding = {
      ...existingOnb,
      ...Object.fromEntries(Object.entries(onb).filter(([, v]) => v !== undefined)),
    };
  }
  if (!existing.createdAt) {
    update.createdAt = serverTimestamp();
  }
  await setDoc(ref, update, { merge: true });
}

export async function ensureUserProfile(
  uid: string,
  email: string,
  displayName?: string
): Promise<void> {
  const dbInstance = getFirestoreInstance();
  if (!dbInstance) return;
  const ref = doc(dbInstance, "users", uid);
  const snap = await getDoc(ref);
  if (snap.exists()) return;
  const trimmed = email.trim().toLowerCase();
  await setDoc(ref, {
    email: trimmed,
    emailLower: trimmed,
    displayName: displayName?.trim() ?? null,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
}

/** Primary gate: mobile `onboardingCompletedAt`; legacy fallback `onboarding.completed`. */
export function isOnboardingCompleted(profile: UserProfile | null): boolean {
  if (profile?.onboardingCompletedAt) return true;
  return !!profile?.onboarding?.completed;
}

/** Treat legacy `company` and web `business` onboarding workspace types as business. */
export function isBusinessOnboardingWorkspaceType(type?: string): boolean {
  return type === "business" || type === "company";
}

export function resolvePostAuthRoute(
  profile: UserProfile | null,
  fallback: string = "/app"
): string {
  return isOnboardingCompleted(profile) ? fallback : "/onboarding";
}

export async function completeOnboarding(uid: string): Promise<void> {
  const dbInstance = getFirestoreInstance();
  if (!dbInstance) throw new Error("Firestore not configured");
  const ref = doc(dbInstance, "users", uid);
  const snap = await getDoc(ref);
  const existing = snap.exists() ? (snap.data() as UserProfile) : {};
  await setDoc(
    ref,
    {
      ...existing,
      onboardingCompletedAt: serverTimestamp(),
      onboarding: {
        ...existing.onboarding,
        completed: true,
        completedAt: serverTimestamp(),
      },
      updatedAt: serverTimestamp(),
    },
    { merge: true }
  );
}
