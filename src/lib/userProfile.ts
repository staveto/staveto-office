import { getFirestoreInstance, doc, getDoc, setDoc, serverTimestamp } from "./firebase";

export type UserProfile = {
  displayName?: string;
  email?: string;
  emailLower?: string;
  firstName?: string;
  lastName?: string;
  createdAt?: unknown;
  updatedAt?: unknown;
  /** Mobile BusinessContext hint (optional on users/{uid}). */
  activeBusinessOrgId?: string;
  onboarding?: {
    purpose?: string;
    role?: string;
    teamSize?: string;
    inviteEmails?: { email: string; role: string }[];
    completed?: boolean;
    completedAt?: unknown;
    source?: "web" | "mobile" | string;
    usageType?: "personal" | "company";
    selectedFeatures?: string[];
    activeWorkspaceId?: string;
    activeWorkspaceType?: "personal" | "company";
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

export function isOnboardingCompleted(profile: UserProfile | null): boolean {
  return !!profile?.onboarding?.completed;
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
