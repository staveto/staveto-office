import { onCall, HttpsError } from "firebase-functions/v2/https";
import { setGlobalOptions } from "firebase-functions/v2";
import {
  handleCreateProjectFromDraft,
  handleGenerateProjectDraft,
  handleUpdateProjectDraftWithAI,
} from "./handlers";
import { functionsPermissionError } from "./permissions";

setGlobalOptions({
  region: "europe-west1",
  maxInstances: 10,
});

function mapError(err: unknown): never {
  console.error("[staveto-ai]", err);
  if (err instanceof functionsPermissionError) {
    throw new HttpsError("permission-denied", err.message);
  }
  if (err instanceof Error) {
    const msg = err.message;
    if (msg.includes("GEMINI_API_KEY")) {
      throw new HttpsError("failed-precondition", "AI service is not configured.");
    }
    if (msg.includes("JSON") || msg.includes("schema")) {
      throw new HttpsError("internal", "AI returned invalid data. Please try again.");
    }
    throw new HttpsError("internal", msg);
  }
  throw new HttpsError("internal", "Unexpected error.");
}

export const generateProjectDraft = onCall(
  { secrets: ["GEMINI_API_KEY"], timeoutSeconds: 120, memory: "512MiB" },
  async (request) => {
    try {
      return await handleGenerateProjectDraft(request.auth?.uid, request.data);
    } catch (e) {
      mapError(e);
    }
  }
);

export const updateProjectDraftWithAI = onCall(
  { secrets: ["GEMINI_API_KEY"], timeoutSeconds: 120, memory: "512MiB" },
  async (request) => {
    try {
      return await handleUpdateProjectDraftWithAI(request.auth?.uid, request.data);
    } catch (e) {
      mapError(e);
    }
  }
);

export const createProjectFromDraft = onCall(
  { timeoutSeconds: 60, memory: "256MiB" },
  async (request) => {
    try {
      return await handleCreateProjectFromDraft(request.auth?.uid, request.data);
    } catch (e) {
      mapError(e);
    }
  }
);
