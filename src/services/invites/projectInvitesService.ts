import { ensureAuthTokenReady, getCallable } from "@/lib/firebase";

export type PendingProjectInvite = {
  projectId: string;
  projectName: string;
  memberId: string;
  invitedBy?: string | null;
  invitedAt?: unknown;
  permissionLevel?: string;
  role?: string;
  sharedItems?: Record<string, boolean>;
  sharedPhaseIds?: string[];
  email?: string;
  name?: string;
};

export async function claimProjectInvites(): Promise<{
  claimedCount: number;
  projectIds: string[];
}> {
  try {
    await ensureAuthTokenReady();
    const callable = getCallable<
      Record<string, never>,
      { claimedCount?: number; projectIds?: string[] }
    >("claimProjectInvites");
    const res = await callable({});
    return {
      claimedCount: res.data?.claimedCount ?? 0,
      projectIds: res.data?.projectIds ?? [],
    };
  } catch {
    return { claimedCount: 0, projectIds: [] };
  }
}

export async function listPendingProjectInvites(): Promise<PendingProjectInvite[]> {
  try {
    await ensureAuthTokenReady();
    const callable = getCallable<
      Record<string, never>,
      { invites?: PendingProjectInvite[] }
    >("listPendingInvites");
    const res = await callable({});
    const rows = res.data?.invites ?? [];
    return rows.filter(
      (i): i is PendingProjectInvite =>
        typeof i === "object" && i !== null && typeof i.projectId === "string"
    );
  } catch (err) {
    console.warn("[invites] listPendingInvites failed", err);
    return [];
  }
}

export async function acceptProjectInvite(
  projectId: string
): Promise<{ ok: boolean; projectId?: string; already?: boolean; reason?: string }> {
  await ensureAuthTokenReady();
  const callable = getCallable<
    { projectId: string },
    { ok?: boolean; projectId?: string; already?: boolean; reason?: string }
  >("acceptProjectInvite");
  const res = await callable({ projectId });
  return {
    ok: res.data?.ok === true,
    projectId: res.data?.projectId,
    already: res.data?.already,
    reason: res.data?.reason,
  };
}

export async function declineProjectInvite(projectId: string): Promise<boolean> {
  await ensureAuthTokenReady();
  const callable = getCallable<{ projectId: string }, { ok?: boolean }>(
    "declineProjectInvite"
  );
  const res = await callable({ projectId });
  return res.data?.ok === true;
}
