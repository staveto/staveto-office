import { doc, getDoc, getFirestoreInstance } from "@/lib/firebase";
import type { AttachmentSummary } from "@/types/attachmentDraft";
import type { ProjectDraftPayload } from "@/types/aiProjectDraft";
import { getWorkspaceStorageKey } from "@/lib/workspaceStorage";
import type { ActiveWorkspace } from "@/types/workspace";
import type { AiProjectFactsPersisted } from "./aiSetupTypes";
import { parseAiSetupMeta } from "./aiSetupHelpers";

export type AiSetupProjectContext = {
  projectFacts?: AiProjectFactsPersisted;
  attachmentFindings?: AttachmentSummary[];
};

export async function loadAiSetupProjectContext(input: {
  projectId: string;
  aiDraftId?: string | null;
  quoteDraftNotes?: string | null;
  workspace: ActiveWorkspace;
  userId: string;
}): Promise<AiSetupProjectContext> {
  const fromNotes = parseAiSetupMeta(input.quoteDraftNotes)?.projectFacts;
  if (fromNotes && hasProjectFactsContent(fromNotes)) {
    return { projectFacts: fromNotes };
  }

  if (!input.aiDraftId?.trim()) return {};

  const db = getFirestoreInstance();
  if (!db) return {};

  const wsKey = getWorkspaceStorageKey(input.workspace, input.userId);
  const snap = await getDoc(
    doc(db, "workspaces", wsKey, "projectDrafts", input.aiDraftId.trim())
  );
  if (!snap.exists()) return {};

  const data = snap.data() as {
    draft?: ProjectDraftPayload;
    attachmentSummaries?: AttachmentSummary[];
  };

  const projectFacts = data.draft?.projectFacts;
  const attachmentFindings = data.attachmentSummaries;

  if (!hasProjectFactsContent(projectFacts) && !attachmentFindings?.length) {
    return {};
  }

  return {
    projectFacts: projectFacts as AiProjectFactsPersisted | undefined,
    attachmentFindings,
  };
}

function hasProjectFactsContent(facts?: AiProjectFactsPersisted | null): boolean {
  if (!facts) return false;
  if (facts.buildingType?.trim()) return true;
  if ((facts.totalKnownAreaM2 ?? 0) > 0) return true;
  if ((facts.rooms?.length ?? 0) > 0) return true;
  if ((facts.dimensions?.length ?? 0) > 0) return true;
  return false;
}

/** Merge draft attachment rows into editable projectFacts (single source for the setup UI). */
export function mergeAttachmentContextIntoProjectFacts(
  facts?: AiProjectFactsPersisted,
  findings?: AttachmentSummary[]
): AiProjectFactsPersisted | undefined {
  const roomsFromFindings = (findings ?? []).flatMap((f) =>
    (f.roomsAndAreas ?? []).map((r) => ({
      name: r.roomName,
      areaM2: r.areaM2,
    }))
  );
  const dimsFromFindings = (findings ?? []).flatMap((f) => f.dimensions ?? []);

  const merged: AiProjectFactsPersisted = {
    buildingType: facts?.buildingType,
    totalKnownAreaM2: facts?.totalKnownAreaM2,
    rooms: facts?.rooms?.length ? [...facts.rooms] : roomsFromFindings.length ? roomsFromFindings : undefined,
    dimensions: [...(facts?.dimensions ?? [])],
  };

  const dimKeys = new Set(
    (merged.dimensions ?? []).map((d) => `${d.label.trim().toLowerCase()}::${d.value.trim().toLowerCase()}`)
  );
  for (const dim of dimsFromFindings) {
    const key = `${dim.label.trim().toLowerCase()}::${dim.value.trim().toLowerCase()}`;
    if (dimKeys.has(key)) continue;
    merged.dimensions = [...(merged.dimensions ?? []), { label: dim.label, value: dim.value }];
    dimKeys.add(key);
  }

  return hasProjectFactsContent(merged) ? merged : undefined;
}
