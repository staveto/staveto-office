import type { ProjectDoc } from "@/lib/projects";
import {
  listMyEquipment,
  listUserEquipment,
  setUserEquipmentProjectAssignment,
} from "@/services/equipment/userEquipmentService";
import type { UserEquipmentDoc } from "@/services/equipment/types";
import type { TaskToolSnapshot } from "./taskPlanningTypes";

export type ProjectToolRecord = TaskToolSnapshot & {
  ownerId: string;
  assignedToProject: boolean;
  status?: string;
};

function equipmentToRecord(row: UserEquipmentDoc, ownerId: string, projectId: string): ProjectToolRecord {
  return {
    id: row.id,
    name: row.name,
    type: row.category ?? null,
    qrCode: row.internalCode ?? null,
    ownerId,
    assignedToProject: row.assignedProjectId === projectId,
    status: row.status,
  };
}

function isPickableForProject(row: UserEquipmentDoc, projectId: string): boolean {
  if (row.status === "inactive") return false;
  if (!row.assignedProjectId) return true;
  return row.assignedProjectId === projectId;
}

/**
 * Equipment the current user can pick for tasks / project assignment.
 * Firestore rules allow reading only own `users/{uid}/equipment`.
 */
export async function listToolsForCurrentUser(
  project: ProjectDoc,
  currentUserId: string
): Promise<ProjectToolRecord[]> {
  const rows = await listMyEquipment({ status: "all" });
  return rows
    .filter((row) => isPickableForProject(row, project.id))
    .map((row) => equipmentToRecord(row, currentUserId, project.id))
    .sort((a, b) => a.name.localeCompare(b.name));
}

/** Best-effort: also load project owner equipment when rules allow (same uid). */
export async function listProjectTools(
  project: ProjectDoc,
  currentUserId?: string
): Promise<TaskToolSnapshot[]> {
  const records: ProjectToolRecord[] = [];
  const seen = new Set<string>();

  if (currentUserId) {
    const mine = await listToolsForCurrentUser(project, currentUserId);
    for (const r of mine) {
      if (!seen.has(r.id)) {
        seen.add(r.id);
        records.push(r);
      }
    }
  }

  const uids = new Set<string>();
  if (project.ownerId) uids.add(project.ownerId);
  for (const uid of project.assignedMemberIds ?? []) {
    if (uid) uids.add(uid);
  }

  await Promise.all(
    [...uids].map(async (uid) => {
      if (uid === currentUserId) return;
      try {
        const rows = await listUserEquipment(uid, { status: "all" });
        for (const row of rows) {
          if (!isPickableForProject(row, project.id)) continue;
          if (seen.has(row.id)) continue;
          seen.add(row.id);
          records.push(equipmentToRecord(row, uid, project.id));
        }
      } catch {
        /* permission denied for other user's equipment */
      }
    })
  );

  return records.sort((a, b) => a.name.localeCompare(b.name));
}

/** Equipment already linked to this project via assignedProjectId (current user). */
export async function listProjectAssignedTools(
  projectId: string,
  currentUserId: string
): Promise<ProjectToolRecord[]> {
  const rows = await listMyEquipment({ status: "all" });
  return rows
    .filter((row) => row.assignedProjectId === projectId && row.status !== "inactive")
    .map((row) => equipmentToRecord(row, currentUserId, projectId))
    .sort((a, b) => a.name.localeCompare(b.name));
}

export async function assignToolsToProject(
  projectId: string,
  currentUserId: string,
  tools: TaskToolSnapshot[]
): Promise<void> {
  await Promise.all(
    tools.map((tool) =>
      setUserEquipmentProjectAssignment(currentUserId, tool.id, projectId)
    )
  );
}

export async function unassignToolFromProject(
  currentUserId: string,
  equipmentId: string
): Promise<void> {
  await setUserEquipmentProjectAssignment(currentUserId, equipmentId, null);
}
