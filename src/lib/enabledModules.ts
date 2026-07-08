import type { CompanyType } from "@/lib/onboardingTypes";

export type ModuleKey =
  | "jobs"
  | "quotes"
  | "team"
  | "documents"
  | "planning"
  | "vehicles"
  | "equipment"
  | "expenses"
  | "billing"
  | "reports"
  | "issues";

export const MODULE_KEYS: readonly ModuleKey[] = [
  "jobs",
  "quotes",
  "team",
  "documents",
  "planning",
  "vehicles",
  "equipment",
  "expenses",
  "billing",
  "reports",
  "issues",
] as const;

export const REQUIRED_MODULES: readonly ModuleKey[] = ["jobs", "team", "billing"] as const;

export type EnabledModulesMap = Record<ModuleKey, boolean>;

export type EnabledModulesPartial = Partial<EnabledModulesMap>;

export const DEFAULT_ENABLED_MODULES: EnabledModulesMap = {
  jobs: true,
  quotes: true,
  team: true,
  documents: true,
  billing: true,
  planning: false,
  vehicles: false,
  equipment: false,
  expenses: false,
  reports: false,
  issues: false,
};

/** Suggested optional modules enabled by company type (merged with defaults). */
export function getSuggestedModulesForCompanyType(
  companyType?: string | null
): EnabledModulesMap {
  const base = { ...DEFAULT_ENABLED_MODULES };
  const type = (companyType?.trim().toLowerCase() ?? "other") as CompanyType;

  const enable = (...keys: ModuleKey[]) => {
    for (const key of keys) base[key] = true;
  };

  switch (type) {
    case "hvac":
      enable("planning", "equipment", "vehicles");
      break;
    case "construction":
      enable("planning", "vehicles");
      break;
    case "electrical":
    case "plumbing":
      enable("planning", "equipment");
      if (type === "plumbing") enable("vehicles");
      break;
    case "painting":
      enable("planning");
      break;
    case "roofing":
      enable("planning", "equipment", "vehicles");
      break;
    default:
      enable("planning");
      break;
  }

  for (const key of REQUIRED_MODULES) {
    base[key] = true;
  }

  return base;
}

export function resolveEnabledModules(
  stored?: EnabledModulesPartial | null
): EnabledModulesMap {
  const resolved = { ...DEFAULT_ENABLED_MODULES };

  if (stored) {
    for (const key of MODULE_KEYS) {
      if (typeof stored[key] === "boolean") {
        resolved[key] = stored[key]!;
      }
    }
  }

  for (const key of REQUIRED_MODULES) {
    resolved[key] = true;
  }

  return resolved;
}

export function isModuleEnabled(
  modules: EnabledModulesMap,
  key: ModuleKey
): boolean {
  return modules[key];
}

export function sanitizeEnabledModulesPatch(
  patch: EnabledModulesPartial
): EnabledModulesPartial {
  const next: EnabledModulesPartial = { ...patch };
  for (const key of REQUIRED_MODULES) {
    next[key] = true;
  }
  return next;
}
