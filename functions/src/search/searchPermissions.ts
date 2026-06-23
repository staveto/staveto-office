import type { WorkspaceRole } from "../permissions";
import type { SearchIndexItem, SearchIndexItemType } from "./buildSearchIndexItem";

const MANAGEMENT_ROLES: WorkspaceRole[] = ["owner", "admin", "manager", "accountant"];

/** Role-based visibility for search hits. Never widens org scope — org filter is upstream. */
export function canViewSearchItem(
  role: WorkspaceRole,
  item: SearchIndexItem,
  uid: string
): boolean {
  if (MANAGEMENT_ROLES.includes(role)) return true;

  const vis = item.visibility;
  if (vis) {
    if (role === "owner" && vis.owner) return true;
    if ((role === "admin" || role === "manager" || role === "accountant") && vis.manager) return true;
    if (role === "manager" && vis.teamleader) return true;
    if (role === "worker" && vis.employee) return true;
    if (vis.employee === false && role === "worker") return false;
  }

  if (role === "client" || role === "worker") {
    if (item.type === "action") return true;
    if (item.type === "member" && item.sourceId !== uid) return false;
    if (item.type === "offer" && role === "worker") return false;
    if (item.type === "customer" && role === "worker") return false;
    if (item.type === "project") {
      return item.keywords.includes(`assignee:${uid}`) || item.keywords.includes("assigned");
    }
    if (item.type === "task") {
      return item.keywords.includes(`assignee:${uid}`);
    }
    if (item.type === "note") {
      return item.keywords.includes("shared");
    }
  }

  return role !== "client" || item.type === "project" || item.type === "task";
}

export function defaultVisibilityForType(
  type: SearchIndexItemType
): SearchIndexItem["visibility"] {
  switch (type) {
    case "offer":
    case "customer":
      return { owner: true, manager: true, teamleader: true, employee: false };
    case "member":
      return { owner: true, manager: true, teamleader: true, employee: true };
    case "vehicle":
    case "tool":
      return { owner: true, manager: true, teamleader: true, employee: true };
    default:
      return { owner: true, manager: true, teamleader: true, employee: true };
  }
}
