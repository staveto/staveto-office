import type { CompanyType } from "@/lib/onboardingTypes";
import { WORK_TYPES, type WorkType } from "@/lib/workTypes";

export type EnabledWorkTypesMap = Record<WorkType, boolean>;

export type EnabledWorkTypesPartial = Partial<EnabledWorkTypesMap>;

export const DEFAULT_ENABLED_WORK_TYPES: EnabledWorkTypesMap = {
  service_inspection: true,
  customer_job: true,
  large_construction_project: true,
  own_build: true,
  internal_project: true,
};

export function resolveEnabledWorkTypes(
  stored?: EnabledWorkTypesPartial | null
): EnabledWorkTypesMap {
  const resolved = { ...DEFAULT_ENABLED_WORK_TYPES };

  if (stored) {
    for (const key of WORK_TYPES) {
      if (typeof stored[key] === "boolean") {
        resolved[key] = stored[key]!;
      }
    }
  }

  if (countEnabledWorkTypes(resolved) === 0) {
    return { ...DEFAULT_ENABLED_WORK_TYPES };
  }

  return resolved;
}

export function countEnabledWorkTypes(map: EnabledWorkTypesMap): number {
  return WORK_TYPES.filter((key) => map[key]).length;
}

export function isWorkTypeEnabled(
  map: EnabledWorkTypesMap,
  workType: WorkType
): boolean {
  return map[workType];
}

export function listEnabledWorkTypes(map: EnabledWorkTypesMap): WorkType[] {
  return WORK_TYPES.filter((key) => map[key]);
}

export function canDisableWorkType(
  map: EnabledWorkTypesMap,
  workType: WorkType
): boolean {
  if (!map[workType]) return true;
  return countEnabledWorkTypes(map) > 1;
}

export function sanitizeEnabledWorkTypesPatch(
  current: EnabledWorkTypesMap,
  patch: EnabledWorkTypesPartial
): EnabledWorkTypesMap {
  const merged = resolveEnabledWorkTypes({ ...current, ...patch });
  if (countEnabledWorkTypes(merged) === 0) {
    return current;
  }
  return merged;
}

/** Suggested defaults when creating a company (all types remain available unless tuned). */
export function getSuggestedWorkTypesForCompanyType(
  companyType?: string | null
): EnabledWorkTypesMap {
  const base = { ...DEFAULT_ENABLED_WORK_TYPES };
  const type = (companyType?.trim().toLowerCase() ?? "other") as CompanyType;

  const disable = (...keys: WorkType[]) => {
    for (const key of keys) base[key] = false;
  };

  switch (type) {
    case "construction":
      disable("service_inspection");
      break;
    case "hvac":
    case "electrical":
    case "plumbing":
      disable("large_construction_project", "own_build");
      break;
    case "painting":
    case "roofing":
      disable("own_build", "internal_project");
      break;
    default:
      break;
  }

  if (countEnabledWorkTypes(base) === 0) {
    return { ...DEFAULT_ENABLED_WORK_TYPES };
  }

  return base;
}
