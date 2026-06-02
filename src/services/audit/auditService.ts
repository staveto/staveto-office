/**
 * Audit log foundation (Phase 1).
 * Firestore writes are deferred until rules and paths are confirmed in production.
 */
import type { ActiveWorkspace } from "@/types/workspace";

export type AuditEventType =
  | "project.created"
  | "project.updated"
  | "project.deleted"
  | "workspace.switched"
  | "member.invited"
  | "member.removed";

export type AuditActor = {
  uid: string;
  email?: string;
};

export type AuditEntityRef = {
  type: string;
  id: string;
};

export type AuditEventInput = {
  type: AuditEventType;
  actor: AuditActor;
  workspace?: Pick<ActiveWorkspace, "id" | "type" | "orgId" | "source">;
  entity?: AuditEntityRef;
  metadata?: Record<string, unknown>;
};

export type AuditEventRecord = AuditEventInput & {
  id: string;
  createdAt: string;
  source: "web" | "mobile" | "ai" | "integration";
};

/**
 * Build a client-side audit payload (no Firestore write).
 */
export function buildAuditEvent(input: AuditEventInput): AuditEventRecord {
  return {
    ...input,
    id: `audit_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
    createdAt: new Date().toISOString(),
    source: "web",
  };
}

/**
 * Future paths (documented, not written in Phase 1):
 * - company: `organizations/{orgId}/auditLogs/{eventId}`
 * - normalized: `workspaces/{workspaceId}/auditLogs/{eventId}`
 */
export function getAuditLogCollectionPath(
  workspace: Pick<ActiveWorkspace, "type" | "orgId" | "id">
): string | null {
  if (workspace.type === "company" && workspace.orgId) {
    return `organizations/${workspace.orgId}/auditLogs`;
  }
  if (workspace.type === "personal") {
    // TODO: personal audit path when product defines it
    return null;
  }
  return null;
}

/**
 * Phase 1: prepare event only. No Firestore write until rules are deployed.
 */
export async function logAuditEvent(input: AuditEventInput): Promise<AuditEventRecord> {
  const event = buildAuditEvent(input);
  const path = input.workspace ? getAuditLogCollectionPath(input.workspace) : null;

  if (process.env.NODE_ENV === "development") {
    console.debug("[audit:prepare]", { path, event });
  }

  // TODO(Phase 2): persist via addDoc when Firestore rules allow auditLogs subcollection
  void path;

  return event;
}
