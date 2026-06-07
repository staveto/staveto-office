/**
 * UI-only role permission preview matrix.
 * Not used for authorization — display/explanation layer only.
 */

export type PermissionPreviewRole =
  | "owner"
  | "admin"
  | "manager"
  | "worker"
  | "viewer"
  | "partner"
  | "customer";

export type PermissionModuleKey =
  | "dashboard"
  | "jobs"
  | "tasks"
  | "team"
  | "documents"
  | "photos"
  | "offers"
  | "finance"
  | "billing"
  | "settings";

export const PERMISSION_PREVIEW_MODULES: readonly PermissionModuleKey[] = [
  "dashboard",
  "jobs",
  "tasks",
  "team",
  "documents",
  "photos",
  "offers",
  "finance",
  "billing",
  "settings",
] as const;

export const ROLE_PERMISSION_MATRIX: Record<
  PermissionPreviewRole,
  Record<PermissionModuleKey, boolean>
> = {
  owner: {
    dashboard: true,
    jobs: true,
    tasks: true,
    team: true,
    documents: true,
    photos: true,
    offers: true,
    finance: true,
    billing: true,
    settings: true,
  },
  admin: {
    dashboard: true,
    jobs: true,
    tasks: true,
    team: true,
    documents: true,
    photos: true,
    offers: true,
    finance: true,
    billing: false,
    settings: true,
  },
  manager: {
    dashboard: true,
    jobs: true,
    tasks: true,
    team: true,
    documents: true,
    photos: true,
    offers: true,
    finance: false,
    billing: false,
    settings: false,
  },
  worker: {
    dashboard: true,
    jobs: true,
    tasks: true,
    team: false,
    documents: true,
    photos: true,
    offers: false,
    finance: false,
    billing: false,
    settings: false,
  },
  viewer: {
    dashboard: true,
    jobs: false,
    tasks: false,
    team: false,
    documents: true,
    photos: true,
    offers: false,
    finance: false,
    billing: false,
    settings: false,
  },
  partner: {
    dashboard: false,
    jobs: true,
    tasks: true,
    team: false,
    documents: true,
    photos: true,
    offers: false,
    finance: false,
    billing: false,
    settings: false,
  },
  customer: {
    dashboard: false,
    jobs: true,
    tasks: false,
    team: false,
    documents: true,
    photos: true,
    offers: false,
    finance: false,
    billing: false,
    settings: false,
  },
};

export function isPermissionPreviewRoleComingSoon(role: PermissionPreviewRole): boolean {
  return role === "partner" || role === "customer";
}

const MODULE_LABEL_KEYS: Record<PermissionModuleKey, string> = {
  dashboard: "sidebar.item.overview.dashboard",
  jobs: "sidebar.section.jobs",
  tasks: "sidebar.item.jobs.tasks",
  team: "sidebar.section.team",
  documents: "sidebar.section.documents",
  photos: "sidebar.item.documents.photos",
  offers: "welcomeGuide.module.offers.title",
  finance: "sidebar.section.finance",
  billing: "sidebar.item.more.billing",
  settings: "sidebar.item.more.settings",
};

/** i18n key for module label, with role-specific overrides. */
export function getPermissionModuleLabelKey(
  role: PermissionPreviewRole,
  module: PermissionModuleKey
): string {
  if (module === "jobs") {
    if (role === "worker" || role === "partner") {
      return "members.permissionPreview.module.assignedJobs";
    }
    if (role === "customer") {
      return "members.permissionPreview.module.approvedProjectView";
    }
  }
  return MODULE_LABEL_KEYS[module];
}

export function mapInviteChoiceToPreviewRole(
  choice: "manager" | "worker" | "viewer" | "partner" | "customer"
): PermissionPreviewRole {
  if (choice === "partner" || choice === "customer") return choice;
  return choice;
}
