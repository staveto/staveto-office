import { onCall, HttpsError } from "firebase-functions/v2/https";
import { setGlobalOptions } from "firebase-functions/v2";
import { ZodError } from "zod";
import {
  handleCreateProjectFromDraft,
  handleGenerateProjectDraft,
  handleGetProjectDocumentDownloadUrl,
  handleImportProjectDraftAttachments,
  handleUpdateProjectDraftWithAI,
} from "./handlers";
import { handleCreateBusinessOrg } from "./businessOrg";
import { handleAskManagerAgent } from "./managerAgent";
import { handleGlobalSearch } from "./search/globalSearch";
import { gmailBuildAuthUrl, gmailDisconnect, gmailOAuthCallback } from "./gmail";
import { isGeminiOverloadedError, isGeminiQuotaError } from "./gemini";
import { functionsPermissionError } from "./permissions";

setGlobalOptions({
  region: "europe-west1",
  maxInstances: 10,
});

const callableOptions = {
  timeoutSeconds: 120,
  memory: "512MiB" as const,
  /** Required for browser clients (Firebase SDK → Cloud Run). */
  invoker: "public" as const,
};

const aiDraftCallableOptions = {
  ...callableOptions,
  /** Vision + draft JSON can exceed 120s when attachments are present. */
  timeoutSeconds: 300,
  memory: "1GiB" as const,
};

function mapError(err: unknown): never {
  console.error("[staveto-ai]", err);
  if (err instanceof HttpsError) {
    throw err;
  }
  if (err instanceof functionsPermissionError) {
    throw new HttpsError("permission-denied", err.message);
  }
  if (err instanceof ZodError) {
    const msg = err.errors.map((e) => `${e.path.join(".")}: ${e.message}`).join("; ");
    throw new HttpsError("invalid-argument", msg || "Invalid request.");
  }
  if (err instanceof Error) {
    const msg = err.message;
    if (msg.includes("GEMINI_API_KEY")) {
      throw new HttpsError("failed-precondition", "AI service is not configured.");
    }
    if (isGeminiQuotaError(err)) {
      throw new HttpsError(
        "resource-exhausted",
        "Gemini API quota exceeded. Wait a few minutes, enable billing in Google AI Studio, or set GEMINI_MODEL to another model."
      );
    }
    if (isGeminiOverloadedError(err)) {
      throw new HttpsError(
        "unavailable",
        "AI service is busy. Please try again in a moment."
      );
    }
    if (msg.includes("GoogleGenerativeAI") || msg.includes("generativelanguage.googleapis.com")) {
      throw new HttpsError("unavailable", "AI service is temporarily unavailable. Please try again.");
    }
    if (msg.includes("JSON") || msg.includes("schema")) {
      throw new HttpsError("internal", "AI returned invalid data. Please try again.");
    }
    throw new HttpsError("internal", msg);
  }
  throw new HttpsError("internal", "Unexpected error.");
}

export const generateProjectDraft = onCall(
  { ...aiDraftCallableOptions, secrets: ["GEMINI_API_KEY"] },
  async (request) => {
    try {
      return await handleGenerateProjectDraft(request.auth?.uid, request.data);
    } catch (e) {
      mapError(e);
    }
  }
);

export const updateProjectDraftWithAI = onCall(
  { ...aiDraftCallableOptions, secrets: ["GEMINI_API_KEY"] },
  async (request) => {
    try {
      return await handleUpdateProjectDraftWithAI(request.auth?.uid, request.data);
    } catch (e) {
      mapError(e);
    }
  }
);

export const createProjectFromDraft = onCall(
  { ...callableOptions, timeoutSeconds: 120, memory: "512MiB" as const },
  async (request) => {
    try {
      return await handleCreateProjectFromDraft(request.auth?.uid, request.data);
    } catch (e) {
      mapError(e);
    }
  }
);

export const importProjectDraftAttachments = onCall(
  { ...callableOptions, timeoutSeconds: 60, memory: "256MiB" as const },
  async (request) => {
    try {
      return await handleImportProjectDraftAttachments(request.auth?.uid, request.data);
    } catch (e) {
      mapError(e);
    }
  }
);

export const getProjectDocumentDownloadUrl = onCall(
  { ...callableOptions, timeoutSeconds: 30, memory: "256MiB" as const },
  async (request) => {
    try {
      return await handleGetProjectDocumentDownloadUrl(request.auth?.uid, request.data);
    } catch (e) {
      mapError(e);
    }
  }
);

export const askManagerAgent = onCall(
  { ...callableOptions, secrets: ["GEMINI_API_KEY"], timeoutSeconds: 120, memory: "512MiB" as const },
  async (request) => {
    try {
      return await handleAskManagerAgent(request.auth?.uid, request.data);
    } catch (e) {
      mapError(e);
    }
  }
);

export const createBusinessOrg = onCall(
  { ...callableOptions, timeoutSeconds: 60, memory: "256MiB" as const },
  async (request) => {
    try {
      const actorEmail =
        typeof request.auth?.token?.email === "string" ? request.auth.token.email : null;
      return await handleCreateBusinessOrg(request.auth?.uid, actorEmail, request.data);
    } catch (e) {
      mapError(e);
    }
  }
);

export const globalSearch = onCall(
  { ...callableOptions, timeoutSeconds: 60, memory: "512MiB" as const },
  async (request) => {
    try {
      if (!request.auth?.uid) {
        throw new HttpsError("unauthenticated", "Sign in required.");
      }
      return await handleGlobalSearch(request.auth.uid, request.data);
    } catch (e) {
      mapError(e);
    }
  }
);

export { gmailOAuthCallback, gmailBuildAuthUrl, gmailDisconnect };
