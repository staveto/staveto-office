import { describe, expect, it } from "vitest";
import {
  canDisableWorkType,
  DEFAULT_ENABLED_WORK_TYPES,
  resolveEnabledWorkTypes,
  sanitizeEnabledWorkTypesPatch,
} from "./enabledWorkTypes";

describe("enabledWorkTypes", () => {
  it("defaults all work types to enabled", () => {
    expect(resolveEnabledWorkTypes(null)).toEqual(DEFAULT_ENABLED_WORK_TYPES);
  });

  it("prevents disabling the last enabled work type", () => {
    const onlyCustomer = resolveEnabledWorkTypes({
      service_inspection: false,
      customer_job: true,
      large_construction_project: false,
      own_build: false,
      internal_project: false,
    });
    expect(canDisableWorkType(onlyCustomer, "customer_job")).toBe(false);

    const patched = sanitizeEnabledWorkTypesPatch(onlyCustomer, { customer_job: false });
    expect(patched.customer_job).toBe(true);
  });

  it("allows hiding optional work types when another stays enabled", () => {
    const current = { ...DEFAULT_ENABLED_WORK_TYPES };
    const patched = sanitizeEnabledWorkTypesPatch(current, {
      internal_project: false,
      own_build: false,
    });
    expect(patched.internal_project).toBe(false);
    expect(patched.customer_job).toBe(true);
  });
});
