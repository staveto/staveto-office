import {
  upsertUserProfile,
  isBusinessOnboardingWorkspaceType,
  type UserProfile,
} from "@/lib/userProfile";
import { isOwnerLikeRole } from "@/lib/workspaceProduct";
import type { WorkspaceRole } from "@/types/workspace";
import { serverTimestamp } from "@/lib/firebase";
import type { CompanyType } from "@/lib/onboardingTypes";

export type WelcomeGuideModuleId =
  | "jobs"
  | "team"
  | "vehicles"
  | "tools"
  | "documents"
  | "offers"
  | "dashboard";

export const WELCOME_GUIDE_MODULE_IDS: readonly WelcomeGuideModuleId[] = [
  "jobs",
  "team",
  "vehicles",
  "tools",
  "documents",
  "offers",
  "dashboard",
] as const;

export function isWelcomeGuideModuleId(value: string): value is WelcomeGuideModuleId {
  return (WELCOME_GUIDE_MODULE_IDS as readonly string[]).includes(value);
}

export function shouldShowWelcomeGuide(
  profile: UserProfile | null,
  options: {
    isCompanyWorkspace: boolean;
    role?: WorkspaceRole;
  }
): boolean {
  if (!profile?.activeBusinessOrgId?.trim()) return false;
  if (!options.isCompanyWorkspace) return false;
  if (!isOwnerLikeRole(options.role)) return false;
  if (profile.welcomeGuide?.dismissedAt) return false;

  const workspaceType = profile.onboarding?.activeWorkspaceType;
  if (workspaceType && !isBusinessOnboardingWorkspaceType(workspaceType)) {
    return false;
  }

  return true;
}

export function resolveWelcomeGuideCompanyType(
  orgCompanyType?: string | null
): CompanyType {
  const normalized = orgCompanyType?.trim().toLowerCase();
  const allowed: CompanyType[] = [
    "hvac",
    "electrical",
    "plumbing",
    "construction",
    "painting",
    "roofing",
    "other",
  ];
  if (normalized && allowed.includes(normalized as CompanyType)) {
    return normalized as CompanyType;
  }
  return "other";
}

export async function dismissWelcomeGuide(uid: string): Promise<void> {
  await upsertUserProfile(uid, {
    welcomeGuide: { dismissedAt: serverTimestamp() },
  });
}

export async function saveWelcomeGuideModule(
  uid: string,
  moduleId: WelcomeGuideModuleId
): Promise<void> {
  await upsertUserProfile(uid, {
    welcomeGuide: { lastOpenedModule: moduleId },
  });
}
