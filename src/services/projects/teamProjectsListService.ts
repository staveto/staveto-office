import { ensureAuthTokenReady, getCallable, isFirebaseConfigured } from "@/lib/firebase";
import { toProjectDoc, type ProjectDoc } from "@/lib/projects";

export type TeamProjectsCallableResult = {
  projects: ProjectDoc[] | null;
  errorCode?: string;
  errorMessage?: string;
};

export async function listTeamProjectsViaCallable(
  orgId: string
): Promise<TeamProjectsCallableResult> {
  const trimmed = orgId.trim();
  if (!trimmed) return { projects: null };

  if (!isFirebaseConfigured()) {
    return {
      projects: null,
      errorCode: "firebase-not-configured",
      errorMessage: "Firebase is not configured (NEXT_PUBLIC_FIREBASE_*).",
    };
  }

  try {
    await ensureAuthTokenReady();
    const callable = getCallable<
      { orgId: string },
      { projects: Record<string, unknown>[]; diagnostics?: Record<string, unknown> }
    >("listTeamWorkspaceProjects");
    const res = await callable({ orgId: trimmed });
    const rows = res.data?.projects ?? [];
    if (res.data?.diagnostics) {
      console.warn("[projects] team list diagnostics:", res.data.diagnostics);
    }
    return {
      projects: rows.map((row) => {
        const id = typeof row.id === "string" ? row.id : "";
        return toProjectDoc(id, row);
      }),
    };
  } catch (err) {
    const code =
      typeof err === "object" && err !== null && "code" in err
        ? String((err as { code?: string }).code)
        : "";
    const message = err instanceof Error ? err.message : String(err);
    console.warn("[projects] listTeamWorkspaceProjects callable failed", code, err);
    return { projects: null, errorCode: code || "callable-failed", errorMessage: message };
  }
}
