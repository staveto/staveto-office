/**
 * Work / project types — aligned with Staveto mobile app.
 * Stored on Firestore `projects.projectType` (canonical).
 * Optional legacy/read alias: `workType` (same enum values).
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

/** Resolve type from project document fields (mobile uses projectType). */
export function getProjectWorkType(project: {
  projectType?: string;
  workType?: string;
}): WorkType | undefined {
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
