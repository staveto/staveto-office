export const PLANNING_TASK_DRAG_MIME = "application/x-staveto-planning-task";

export type PlanningTaskDragPayload = {
  taskId: string;
  projectId: string;
};

export function encodeTaskDragPayload(payload: PlanningTaskDragPayload): string {
  return JSON.stringify(payload);
}

export function decodeTaskDragPayload(raw: string): PlanningTaskDragPayload | null {
  try {
    const parsed = JSON.parse(raw) as PlanningTaskDragPayload;
    if (parsed?.taskId && parsed?.projectId) return parsed;
  } catch {
    /* ignore */
  }
  return null;
}

export function displayInitials(name: string | null | undefined): string {
  const trimmed = (name ?? "").trim();
  if (!trimmed) return "?";
  const parts = trimmed.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) {
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  }
  return trimmed.slice(0, 2).toUpperCase();
}
