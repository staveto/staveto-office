/**
 * Company setup checklist — soft completion for optional explore steps.
 * Stored on users/{uid}.companySetupProgress[orgId].
 */
import { upsertUserProfile, type UserProfile } from "@/lib/userProfile";
import type { SetupChecklistItemId } from "@/lib/dashboardCommandCenter";
import { serverTimestamp } from "@/lib/firebase";

/** Steps that complete when the user opens the related area (no create/upload required). */
export type SoftSetupChecklistStepId = Extract<
  SetupChecklistItemId,
  "first_offer" | "first_document"
>;

export type CompanySetupProgress = Partial<Record<SoftSetupChecklistStepId, boolean>> & {
  dismissed?: boolean;
  dismissedAt?: unknown;
  updatedAt?: unknown;
};

export function getCompanySetupProgress(
  profile: UserProfile | null | undefined,
  orgId: string | null | undefined
): CompanySetupProgress {
  const id = orgId?.trim();
  if (!profile?.companySetupProgress || !id) return {};
  return profile.companySetupProgress[id] ?? {};
}

export async function markSetupChecklistStepVisited(
  uid: string,
  orgId: string,
  stepId: SoftSetupChecklistStepId
): Promise<void> {
  const org = orgId.trim();
  if (!org) return;

  await upsertUserProfile(uid, {
    companySetupProgress: {
      [org]: {
        [stepId]: true,
        updatedAt: serverTimestamp(),
      },
    },
  });
}

export function isSetupStepVisited(
  progress: CompanySetupProgress,
  stepId: SoftSetupChecklistStepId
): boolean {
  return progress[stepId] === true;
}

export function isSetupChecklistDismissed(
  progress: CompanySetupProgress | null | undefined
): boolean {
  return progress?.dismissed === true;
}

export async function dismissSetupChecklist(uid: string, orgId: string): Promise<void> {
  const org = orgId.trim();
  if (!org) return;

  await upsertUserProfile(uid, {
    companySetupProgress: {
      [org]: {
        dismissed: true,
        dismissedAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      },
    },
  });
}
