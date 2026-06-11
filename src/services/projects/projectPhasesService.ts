import { getFirestoreInstance, collection, getDocs } from "@/lib/firebase";
import type { ProjectPhaseRecord } from "./taskPlanningTypes";

/** Stable synthetic id for tasks that only have a legacy string `phase` field. */
export function legacyPhaseIdFromName(name: string): string {
  return `legacy:${encodeURIComponent(name.trim().toLowerCase())}`;
}

function readPhasesFromSubcollection(
  snap: Awaited<ReturnType<typeof getDocs>>
): ProjectPhaseRecord[] {
    const phases = snap.docs
      .map((d) => {
        const x = d.data() as Record<string, unknown>;
      return {
        id: d.id,
        name: (x.name as string) ?? "",
        description: (x.description as string) || undefined,
        order: typeof x.order === "number" ? x.order : 0,
      };
    })
    .filter((p) => p.name.trim().length > 0);
  phases.sort((a, b) => a.order - b.order || a.name.localeCompare(b.name));
  return phases;
}

function derivePhasesFromLegacyTasks(
  taskSnap: Awaited<ReturnType<typeof getDocs>>
): ProjectPhaseRecord[] {
  const byKey = new Map<string, ProjectPhaseRecord>();
  let order = 0;

  for (const d of taskSnap.docs) {
    const x = d.data() as Record<string, unknown>;
    const phaseName =
      (typeof x.phaseTitle === "string" && x.phaseTitle.trim()) ||
      (typeof x.phase === "string" && x.phase.trim()) ||
      "";
    if (!phaseName) continue;
    const key = phaseName.toLowerCase();
    if (byKey.has(key)) continue;
    byKey.set(key, {
      id: legacyPhaseIdFromName(phaseName),
      name: phaseName,
      order: order++,
    });
  }

  return [...byKey.values()].sort((a, b) => a.order - b.order || a.name.localeCompare(b.name));
}

export async function listProjectPhases(projectId: string): Promise<ProjectPhaseRecord[]> {
  const db = getFirestoreInstance();
  if (!db) return [];

  try {
    const [phaseSnap, taskSnap] = await Promise.all([
      getDocs(collection(db, "projects", projectId, "phases")),
      getDocs(collection(db, "projects", projectId, "tasks")),
    ]);

    const fromSub = readPhasesFromSubcollection(phaseSnap);
    if (fromSub.length > 0) return fromSub;

    return derivePhasesFromLegacyTasks(taskSnap);
  } catch {
    return [];
  }
}
