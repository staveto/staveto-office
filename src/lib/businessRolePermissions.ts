import type { CanonicalCompanyRole } from "./companyRoles";

/** Configurable Business member permissions (optional override on membership doc). */
export type BusinessPermissions = {
  canViewBusinessDashboard: boolean;
  canViewAllProjects: boolean;
  canViewAssignedProjects: boolean;
  canCreateProject: boolean;
  canEditProject: boolean;
  canAssignProjectMembers: boolean;
  canAddDailyReport: boolean;
  canEditOwnDailyReport: boolean;
  canApproveDailyReports: boolean;
  canAddPhotos: boolean;
  canAddMaterial: boolean;
  canViewMaterialPrices: boolean;
  canAddExpense: boolean;
  canViewProjectCosts: boolean;
  canManageContacts: boolean;
  canManageTeam: boolean;
  canViewBusinessKpis: boolean;
  canManageBilling: boolean;
};

export type BusinessPermissionKey = keyof BusinessPermissions;
export type BusinessRole = CanonicalCompanyRole;

export const BUSINESS_PERMISSION_KEYS: BusinessPermissionKey[] = [
  "canViewBusinessDashboard",
  "canViewAllProjects",
  "canViewAssignedProjects",
  "canCreateProject",
  "canEditProject",
  "canAssignProjectMembers",
  "canAddDailyReport",
  "canEditOwnDailyReport",
  "canApproveDailyReports",
  "canAddPhotos",
  "canAddMaterial",
  "canViewMaterialPrices",
  "canAddExpense",
  "canViewProjectCosts",
  "canManageContacts",
  "canManageTeam",
  "canViewBusinessKpis",
  "canManageBilling",
];

export type PermissionSectionId =
  | "projects"
  | "dailyWork"
  | "materialsExpenses"
  | "businessManagement";

export const PERMISSION_SECTIONS: { id: PermissionSectionId; keys: BusinessPermissionKey[] }[] = [
  {
    id: "projects",
    keys: [
      "canViewAssignedProjects",
      "canViewAllProjects",
      "canCreateProject",
      "canEditProject",
      "canAssignProjectMembers",
    ],
  },
  {
    id: "dailyWork",
    keys: ["canAddDailyReport", "canEditOwnDailyReport", "canApproveDailyReports", "canAddPhotos"],
  },
  {
    id: "materialsExpenses",
    keys: ["canAddMaterial", "canViewMaterialPrices", "canAddExpense", "canViewProjectCosts"],
  },
  {
    id: "businessManagement",
    keys: [
      "canViewBusinessDashboard",
      "canManageTeam",
      "canManageContacts",
      "canViewBusinessKpis",
      "canManageBilling",
    ],
  },
];

const ALL_TRUE: BusinessPermissions = {
  canViewBusinessDashboard: true,
  canViewAllProjects: true,
  canViewAssignedProjects: true,
  canCreateProject: true,
  canEditProject: true,
  canAssignProjectMembers: true,
  canAddDailyReport: true,
  canEditOwnDailyReport: true,
  canApproveDailyReports: true,
  canAddPhotos: true,
  canAddMaterial: true,
  canViewMaterialPrices: true,
  canAddExpense: true,
  canViewProjectCosts: true,
  canManageContacts: true,
  canManageTeam: true,
  canViewBusinessKpis: true,
  canManageBilling: true,
};

export const DEFAULT_ROLE_PERMISSIONS: Record<BusinessRole, BusinessPermissions> = {
  owner: { ...ALL_TRUE },
  admin: {
    ...ALL_TRUE,
    canManageBilling: false,
  },
  manager: {
    canViewBusinessDashboard: true,
    canViewAllProjects: true,
    canViewAssignedProjects: true,
    canCreateProject: true,
    canEditProject: true,
    canAssignProjectMembers: true,
    canAddDailyReport: true,
    canEditOwnDailyReport: true,
    canApproveDailyReports: true,
    canAddPhotos: true,
    canAddMaterial: true,
    canViewMaterialPrices: true,
    canAddExpense: true,
    canViewProjectCosts: true,
    canManageContacts: true,
    canManageTeam: false,
    canViewBusinessKpis: true,
    canManageBilling: false,
  },
  worker: {
    canViewBusinessDashboard: false,
    canViewAllProjects: false,
    canViewAssignedProjects: true,
    canCreateProject: false,
    canEditProject: false,
    canAssignProjectMembers: false,
    canAddDailyReport: true,
    canEditOwnDailyReport: true,
    canApproveDailyReports: false,
    canAddPhotos: true,
    canAddMaterial: true,
    canViewMaterialPrices: false,
    canAddExpense: false,
    canViewProjectCosts: false,
    canManageContacts: false,
    canManageTeam: false,
    canViewBusinessKpis: false,
    canManageBilling: false,
  },
  viewer: {
    canViewBusinessDashboard: false,
    canViewAllProjects: false,
    canViewAssignedProjects: true,
    canCreateProject: false,
    canEditProject: false,
    canAssignProjectMembers: false,
    canAddDailyReport: false,
    canEditOwnDailyReport: false,
    canApproveDailyReports: false,
    canAddPhotos: false,
    canAddMaterial: false,
    canViewMaterialPrices: false,
    canAddExpense: false,
    canViewProjectCosts: false,
    canManageContacts: false,
    canManageTeam: false,
    canViewBusinessKpis: false,
    canManageBilling: false,
  },
};

export function getRolePreset(role: BusinessRole): BusinessPermissions {
  return { ...(DEFAULT_ROLE_PERMISSIONS[role] ?? DEFAULT_ROLE_PERMISSIONS.viewer) };
}

export function resetPermissionsToRolePreset(role: BusinessRole): BusinessPermissions {
  return getRolePreset(role);
}

export function parseCustomPermissions(raw: unknown): Partial<BusinessPermissions> | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const src = raw as Record<string, unknown>;
  const out: Partial<BusinessPermissions> = {};
  for (const key of BUSINESS_PERMISSION_KEYS) {
    if (typeof src[key] === "boolean") {
      out[key] = src[key] as boolean;
    }
  }
  return Object.keys(out).length > 0 ? out : undefined;
}

export function getEffectivePermissions(
  role: BusinessRole,
  customPermissions?: Partial<BusinessPermissions> | null
): BusinessPermissions {
  if (role === "owner") {
    return { ...ALL_TRUE };
  }
  const base = getRolePreset(role);
  if (!customPermissions) return base;
  return { ...base, ...customPermissions };
}

export function permissionsEqual(a: BusinessPermissions, b: BusinessPermissions): boolean {
  return BUSINESS_PERMISSION_KEYS.every((key) => a[key] === b[key]);
}

export function hasCustomPermissions(
  role: BusinessRole,
  customPermissions?: Partial<BusinessPermissions> | null
): boolean {
  if (!customPermissions || role === "owner") return false;
  const preset = getRolePreset(role);
  return BUSINESS_PERMISSION_KEYS.some((key) => {
    if (customPermissions[key] === undefined) return false;
    return customPermissions[key] !== preset[key];
  });
}
