import { doc, getFirestoreInstance, serverTimestamp, updateDoc } from "@/lib/firebase";

export type HideGpsPart = "start" | "end" | "both";

function firestoreErrorMessage(error: unknown): string {
  const err = error as { code?: string; message?: string };
  if (err?.code === "permission-denied") {
    return "permission-denied: Firestore rules blocked GPS hide — deploy mobile/firestore.rules";
  }
  return err?.message ?? String(error);
}

export async function hideTimeEntryGpsLocation(input: {
  entryId: string;
  part: HideGpsPart;
  reason?: string;
  hiddenByUid: string;
}): Promise<void> {
  const db = getFirestoreInstance();
  if (!db) throw new Error("Firestore not configured");

  const trimmedId = input.entryId.trim();
  const trimmedBy = input.hiddenByUid.trim();
  if (!trimmedId || !trimmedBy) throw new Error("Invalid hide GPS request");

  const patch: Record<string, unknown> = {
    gpsHiddenBy: trimmedBy,
    gpsHiddenAt: serverTimestamp(),
  };

  const reason = input.reason?.trim();
  if (reason) patch.gpsHiddenReason = reason;

  if (input.part === "start" || input.part === "both") {
    patch.gpsStartHidden = true;
  }
  if (input.part === "end" || input.part === "both") {
    patch.gpsEndHidden = true;
  }

  try {
    await updateDoc(doc(db, "timeEntries", trimmedId), patch);
  } catch (error) {
    throw new Error(firestoreErrorMessage(error));
  }
}
