import type { WorkType } from "./workTypes";

/** Mirrors mobile `getNewJobArchetypeAiContextHint` for projectDetails on generate. */
export function getNewJobArchetypeAiContextHint(archetype: WorkType): string {
  switch (archetype) {
    case "service_inspection":
      return (
        "Job archetype: service/inspection visit (diagnostics, repair, warranty, short on-site work). " +
        "Prefer a compact checklist: diagnosis, work steps, materials, safety, handover."
      );
    case "customer_job":
      return (
        "Job archetype: customer job for a client (may start with an offer before execution). " +
        "Structure for clear quoting and later execution."
      );
    case "large_construction_project":
      return (
        "Job archetype: large construction (full house build, major renovation, long phased project). " +
        "Use a realistic phased construction sequence."
      );
    case "own_build":
      return (
        "Job archetype: owner's own house build or renovation (not a subcontractor job for a client). " +
        "Homeowner-friendly phased plan."
      );
    case "internal_project":
      return (
        "Job archetype: internal company work (preparation, inventory, admin, internal coordination). " +
        "Compact task groups; avoid client-facing offer language."
      );
    default:
      return "";
  }
}
