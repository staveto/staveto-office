/**
 * Job archetypes (UI + `jobArchetype` on Firestore) — aligned with Staveto mobile `NewJobArchetype`.
 * Engine fields on create: `projectType` = BUILD | TRADE, granular `workType`, optional `jobWorkflowKind`.
 */
import type { LucideIcon } from "lucide-react";
import {
  ClipboardCheck,
  HardHat,
  Home,
  Briefcase,
  UserRound,
} from "lucide-react";

export type WorkType =
  | "service_inspection"
  | "customer_job"
  | "large_construction_project"
  | "own_build"
  | "internal_project";

export const WORK_TYPES: readonly WorkType[] = [
  "service_inspection",
  "customer_job",
  "large_construction_project",
  "own_build",
  "internal_project",
] as const;

const WORK_TYPE_SET = new Set<string>(WORK_TYPES);

export const WORK_TYPE_ICONS: Record<WorkType, LucideIcon> = {
  service_inspection: ClipboardCheck,
  customer_job: UserRound,
  large_construction_project: HardHat,
  own_build: Home,
  internal_project: Briefcase,
};

export function isWorkType(value: string | undefined | null): value is WorkType {
  return !!value && WORK_TYPE_SET.has(value);
}

export type EngineProjectType = "BUILD" | "TRADE";

export type EngineWorkType =
  | "NEW_BUILD"
  | "RENOVATION"
  | "INSTALLATION"
  | "SERVICE"
  | "REPAIR"
  | "DELIVERY";

export type JobWorkflowKind = "SERVICE" | "STANDARD";

/** Mobile `resolveInternalProjectTypeFromArchetype`. */
export function resolveEngineProjectTypeFromArchetype(archetype: WorkType): EngineProjectType {
  if (archetype === "large_construction_project" || archetype === "own_build") return "BUILD";
  return "TRADE";
}

/** Mobile `resolveJobWorkflowKindFromArchetype`. */
export function resolveJobWorkflowKindFromArchetype(
  archetype: WorkType
): JobWorkflowKind | undefined {
  return archetype === "service_inspection" ? "SERVICE" : undefined;
}

/** Default granular `workType` when user picks an archetype card (mobile engine). */
export function resolveEngineWorkTypeFromArchetype(archetype: WorkType): EngineWorkType {
  switch (archetype) {
    case "large_construction_project":
    case "own_build":
      return "NEW_BUILD";
    case "service_inspection":
      return "SERVICE";
    case "customer_job":
    case "internal_project":
    default:
      return "REPAIR";
  }
}

export type ArchetypeFirestoreFields = {
  projectType: EngineProjectType;
  workType: EngineWorkType;
  jobArchetype: WorkType;
  jobWorkflowKind?: JobWorkflowKind;
};

/** Map wizard archetype → mobile-compatible Firestore fields (additive; no schema break). */
export function mapArchetypeToFirestoreFields(archetype: WorkType): ArchetypeFirestoreFields {
  const projectType = resolveEngineProjectTypeFromArchetype(archetype);
  const workType = resolveEngineWorkTypeFromArchetype(archetype);
  const jobWorkflowKind = resolveJobWorkflowKindFromArchetype(archetype);
  return {
    projectType,
    workType,
    jobArchetype: archetype,
    ...(jobWorkflowKind ? { jobWorkflowKind } : {}),
  };
}

/** Resolve UI archetype from project document (dual-read legacy web rows). */
export function getProjectWorkType(project: {
  projectType?: string;
  workType?: string;
  jobArchetype?: string;
}): WorkType | undefined {
  if (project.jobArchetype && isWorkType(project.jobArchetype)) {
    return project.jobArchetype;
  }
  if (isWorkType(project.projectType)) return project.projectType;
  if (isWorkType(project.workType)) return project.workType;
  return undefined;
}

export function requiresCustomerRequest(workType: WorkType | undefined): boolean {
  return workType === "customer_job" || workType === "large_construction_project";
}

export function customerFieldsOptional(workType: WorkType | undefined): boolean {
  return workType === "internal_project" || workType === "own_build";
}

/** Customer/contact link is recommended (warning if skipped). */
export function contactRecommendedForWorkType(workType: WorkType | undefined): boolean {
  return workType === "customer_job" || workType === "large_construction_project";
}

export function workTypeLabelKey(workType: WorkType): string {
  return `projects.workType.${workType}`;
}

export function workTypeHintKey(workType: WorkType): string {
  return `projects.workType.${workType}.hint`;
}
