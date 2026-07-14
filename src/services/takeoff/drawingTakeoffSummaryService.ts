/**
 * Load drawing takeoff summary for a project (and optional drawing).
 */

import { listDrawingOccurrences } from "./drawingOccurrenceService";
import { getProject } from "@/lib/projects";
import {
  buildDrawingTakeoffSummary,
  type DrawingTakeoffSummary,
} from "@/lib/takeoff/drawingTakeoffSummary";

export async function getDrawingTakeoffSummary(
  projectId: string,
  documentId?: string
): Promise<DrawingTakeoffSummary> {
  const [occurrences, project] = await Promise.all([
    listDrawingOccurrences(projectId, documentId),
    getProject(projectId),
  ]);
  const skippedManual = project?.visualTakeoffStatus === "skipped_manual";
  return buildDrawingTakeoffSummary(occurrences, { skippedManual });
}
