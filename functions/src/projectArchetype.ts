/** Mirrors web `src/lib/workTypes.ts` — keep in sync for callable project create. */

export const WORK_ARCHETYPES = [
  "service_inspection",
  "customer_job",
  "large_construction_project",
  "own_build",
  "internal_project",
] as const;

export type WorkArchetype = (typeof WORK_ARCHETYPES)[number];

function isWorkArchetype(value: string): value is WorkArchetype {
  return (WORK_ARCHETYPES as readonly string[]).includes(value);
}

export function mapArchetypeToFirestoreFields(archetype: string): {
  projectType: "BUILD" | "TRADE";
  workType: string;
  jobArchetype: WorkArchetype;
  jobWorkflowKind?: "SERVICE";
} | null {
  if (!isWorkArchetype(archetype)) return null;
  const projectType =
    archetype === "large_construction_project" || archetype === "own_build" ? "BUILD" : "TRADE";
  const workType =
    archetype === "large_construction_project" || archetype === "own_build"
      ? "NEW_BUILD"
      : archetype === "service_inspection"
        ? "SERVICE"
        : "REPAIR";
  const jobWorkflowKind = archetype === "service_inspection" ? ("SERVICE" as const) : undefined;
  return {
    projectType,
    workType,
    jobArchetype: archetype,
    ...(jobWorkflowKind ? { jobWorkflowKind } : {}),
  };
}
