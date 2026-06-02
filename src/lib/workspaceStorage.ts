import type { ActiveWorkspace } from "@/types/workspace";

/** Firestore/Storage key for workspace-scoped paths. */
export function getWorkspaceStorageKey(
  workspace: ActiveWorkspace,
  uid: string
): string {
  if (workspace.type === "personal") {
    return workspace.ownerId ?? uid;
  }
  return workspace.orgId ?? workspace.id;
}

export function getCompanyIdForCallable(workspace: ActiveWorkspace): string | undefined {
  return workspace.type === "company" ? (workspace.orgId ?? workspace.id) : undefined;
}
