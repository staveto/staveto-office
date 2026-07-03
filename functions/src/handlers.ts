import * as admin from "firebase-admin";
import { FieldValue, Timestamp } from "firebase-admin/firestore";
import { draftLanguageSchema, projectDraftSchema, type ProjectDraftPayload } from "./draftSchema";
import {
  extractFileText,
  collectDraftFilesForGeneration,
  isVisualAttachmentMime,
  loadVisualAttachment,
  markFileDiagnostic,
  type DraftFileRecord,
} from "./files";
import { mapArchetypeToFirestoreFields } from "./projectArchetype";
import {
  assertProjectCreatePermission,
  assertWorkspaceAccess,
  functionsPermissionError,
} from "./permissions";
import { formatAttachmentFindingsForPrompt } from "./attachmentPrompt";
import type { AttachmentProcessing, AttachmentSummary } from "./attachmentSummarySchema";
import {
  enrichDraftWithAttachmentFindings,
  finalizeAttachmentProcessing,
  recordAttachmentFailureDiagnostic,
  recordAttachmentSkippedDiagnostic,
  recordAttachmentSummaryDiagnostic,
} from "./draftAttachmentMerge";
import { buildGeneratePrompt, buildUpdatePrompt, generateDraftWithGemini, summarizeAttachmentsWithGemini, type GeminiInlineAttachment } from "./gemini";
import { sanitizeDraftMaterials } from "./materialDedup";
import { z } from "zod";

if (!admin.apps.length) {
  admin.initializeApp();
}

const db = admin.firestore();
const bucket = admin.storage().bucket();

/** Callable clients may send `null` for omitted fields; normalize before validation. */
function nullishToOptional<T extends z.ZodTypeAny>(schema: T) {
  return z.preprocess((val) => (val === null ? undefined : val), schema);
}

const optionalString = nullishToOptional(z.string().optional());
const optionalStringArray = nullishToOptional(z.array(z.string()).optional());

const newContactSchema = nullishToOptional(
  z
    .object({
      type: z.enum(["person", "company"]),
      name: z.string(),
      email: optionalString,
      phone: optionalString,
      address: optionalString,
      ico: optionalString,
      dic: optionalString,
      vatId: optionalString,
    })
    .optional()
);

const generateInputSchema = z.object({
  workspaceId: z.string(),
  companyId: optionalString,
  userId: z.string(),
  jobType: z.string(),
  contactMode: z.enum(["existing", "new", "none"]),
  contactId: optionalString,
  newContact: newContactSchema,
  description: z.string().min(1),
  location: optionalString,
  language: draftLanguageSchema,
  attachedFileIds: optionalStringArray,
  documentStoragePaths: optionalStringArray,
});

const updateInputSchema = z.object({
  workspaceId: z.string(),
  companyId: optionalString,
  draftId: z.string(),
  userMessage: z.string().min(1),
  language: draftLanguageSchema,
});

const createInputSchema = z.object({
  workspaceId: z.string(),
  companyId: optionalString,
  draftId: z.string(),
});

function assertAuth(uid: string | undefined, inputUserId: string): string {
  if (!uid) throw new functionsPermissionError("Authentication required.");
  if (uid !== inputUserId) throw new functionsPermissionError("User ID mismatch.");
  return uid;
}

async function loadContactSummary(
  access: { storageKey: string; isPersonal: boolean; orgId?: string },
  uid: string,
  contactMode: string,
  contactId?: string,
  newContact?: z.infer<typeof generateInputSchema>["newContact"]
): Promise<string> {
  if (contactMode === "none") return "No customer linked.";
  if (contactMode === "new" && newContact) {
    return JSON.stringify(newContact);
  }
  if (contactMode === "existing" && contactId) {
    const snap = await db.doc(`customers/${contactId}`).get();
    if (!snap.exists) return `Contact ${contactId} (not found in CRM)`;
    const c = snap.data() as Record<string, unknown>;
    return JSON.stringify({
      id: contactId,
      name: c.name,
      email: c.email,
      phone: c.phone,
      address: c.address,
    });
  }
  return "Not provided";
}

function mergeCustomerIntoDraft(
  draft: ProjectDraftPayload,
  input: z.infer<typeof generateInputSchema>
): ProjectDraftPayload {
  const customer = { ...draft.customer, mode: input.contactMode };
  if (input.contactMode === "existing" && input.contactId) {
    customer.contactId = input.contactId;
  }
  if (input.contactMode === "new" && input.newContact) {
    customer.name = input.newContact.name;
    customer.email = input.newContact.email ?? null;
    customer.phone = input.newContact.phone ?? null;
    customer.contactId = null;
  }
  if (input.contactMode === "none") {
    customer.contactId = null;
    customer.name = null;
    customer.email = null;
    customer.phone = null;
  }
  return {
    ...draft,
    projectType: input.jobType,
    location: draft.location ?? input.location ?? null,
    customer,
    source: {
      ...draft.source,
      creationMethod: "ai",
      attachedFileIds: input.attachedFileIds ?? [],
      generatedAt: new Date().toISOString(),
    },
  };
}

export async function handleGenerateProjectDraft(
  authUid: string | undefined,
  data: unknown
): Promise<{
  draftId: string;
  draft: ProjectDraftPayload;
  warnings?: string[];
  attachmentProcessing: AttachmentProcessing;
}> {
  const input = generateInputSchema.parse(data);
  assertAuth(authUid, input.userId);

  const access = await assertWorkspaceAccess(
    db,
    input.userId,
    input.workspaceId,
    input.companyId
  );
  assertProjectCreatePermission(access);

  const contactSummaryPromise = loadContactSummary(
    access,
    input.userId,
    input.contactMode,
    input.contactId,
    input.newContact
  );

  const fileCollection = await collectDraftFilesForGeneration({
    db,
    storageKey: access.storageKey,
    authUid: input.userId,
    attachedFileIds: input.attachedFileIds,
    documentStoragePaths: input.documentStoragePaths,
  });
  const { files } = fileCollection;
  let attachmentProcessing = fileCollection.attachmentProcessing;
  const warnings: string[] = [...attachmentProcessing.warnings];
  const documentTexts: { fileName: string; text: string }[] = [];
  const visualAttachments: GeminiInlineAttachment[] = [];
  const visualFileByName = new Map<string, DraftFileRecord>();

  const extractions = await Promise.all(
    files.map(async (file) => {
      const mime = file.mimeType?.toLowerCase() ?? "";
      if (isVisualAttachmentMime(mime)) {
        const visual = await loadVisualAttachment(bucket, file);
        if (visual) {
          visualAttachments.push(visual);
          visualFileByName.set(file.fileName, file);
          return { file, extracted: { text: "", status: "ok" as const } };
        }
        recordAttachmentFailureDiagnostic(
          attachmentProcessing.processedFiles,
          file,
          "Attachment too large or could not be loaded for AI vision."
        );
        return {
          file,
          extracted: {
            text: "",
            status: "partial" as const,
            note: "Attachment too large or could not be loaded for AI vision.",
          },
        };
      }
      const extracted =
        file.extractedText ?
          { text: file.extractedText, status: "ok" as const }
        : await extractFileText(bucket, file);
      if (extracted.text) {
        markFileDiagnostic(attachmentProcessing.processedFiles, file, {
          status: "processed",
          extractedSignals: { hasMaterialNotes: true },
        });
      } else if (extracted.status === "unsupported" || extracted.status === "error") {
        recordAttachmentSkippedDiagnostic(
          attachmentProcessing.processedFiles,
          file,
          extracted.note ?? "Unsupported file type for text extraction."
        );
      }
      return { file, extracted };
    })
  );

  for (const { file, extracted } of extractions) {
    if (extracted.status !== "ok" && extracted.note) {
      warnings.push(`${file.fileName}: ${extracted.note}`);
    }
    if (extracted.text) {
      documentTexts.push({ fileName: file.fileName, text: extracted.text });
    }
  }

  let attachmentSummaries: AttachmentSummary[] = [];
  if (visualAttachments.length > 0) {
    attachmentSummaries = await summarizeAttachmentsWithGemini(visualAttachments, input.language);
    const summarizedNames = new Set(attachmentSummaries.map((s) => s.fileName));
    for (const summary of attachmentSummaries) {
      const file = visualFileByName.get(summary.fileName);
      if (file) {
        recordAttachmentSummaryDiagnostic(attachmentProcessing.processedFiles, file, summary);
      }
    }
    for (const att of visualAttachments) {
      if (!summarizedNames.has(att.fileName)) {
        warnings.push(`${att.fileName}: AI could not read this attachment.`);
        const file = visualFileByName.get(att.fileName);
        if (file) {
          recordAttachmentFailureDiagnostic(
            attachmentProcessing.processedFiles,
            file,
            "AI could not read this attachment."
          );
        }
      }
    }
  }

  attachmentProcessing = finalizeAttachmentProcessing(attachmentProcessing, warnings);

  const contactSummary = await contactSummaryPromise;
  const attachmentFindingsText = formatAttachmentFindingsForPrompt(attachmentSummaries);

  const prompt = buildGeneratePrompt({
    language: input.language,
    jobType: input.jobType,
    contactMode: input.contactMode,
    contactSummary,
    description: input.description,
    location: input.location,
    documentTexts,
    attachmentFindingsText,
  });

  let rawDraft = await generateDraftWithGemini(
    `${prompt}\n\nAttached file IDs: ${JSON.stringify(input.attachedFileIds ?? [])}`,
    { retryInvalidJson: true }
  );
  rawDraft = mergeCustomerIntoDraft(rawDraft, input);
  if (attachmentSummaries.length > 0) {
    rawDraft = enrichDraftWithAttachmentFindings(rawDraft, attachmentSummaries);
    if (!rawDraft.attachmentFindings?.length) {
      rawDraft.attachmentFindings = attachmentSummaries;
    }
  }
  const draft = projectDraftSchema.parse(sanitizeDraftMaterials(rawDraft));

  const draftRef = db.collection(`workspaces/${access.storageKey}/projectDrafts`).doc();
  const chatMessage = {
    role: "assistant" as const,
    content: draft.summary,
    at: Timestamp.now(),
  };

  await draftRef.set({
    draft,
    attachmentProcessing,
    workspaceId: access.storageKey,
    orgId: access.orgId ?? null,
    ownerId: access.isPersonal ? input.userId : null,
    createdBy: input.userId,
    jobType: input.jobType,
    contactMode: input.contactMode,
    contactId: input.contactId ?? null,
    newContact: input.newContact ?? null,
    inputDescription: input.description,
    location: input.location ?? null,
    language: input.language,
    status: "draft",
    version: 1,
    chatHistory: [chatMessage],
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  });

  return {
    draftId: draftRef.id,
    draft,
    warnings: warnings.length ? warnings : undefined,
    attachmentProcessing,
  };
}

export async function handleUpdateProjectDraftWithAI(
  authUid: string | undefined,
  data: unknown
): Promise<{ draft: ProjectDraftPayload; version: number }> {
  const input = updateInputSchema.parse(data);
  if (!authUid) throw new functionsPermissionError("Authentication required.");

  const access = await assertWorkspaceAccess(
    db,
    authUid,
    input.workspaceId,
    input.companyId
  );
  assertProjectCreatePermission(access);

  const draftRef = db.doc(
    `workspaces/${access.storageKey}/projectDrafts/${input.draftId}`
  );
  const snap = await draftRef.get();
  if (!snap.exists) throw new Error("Draft not found.");

  const stored = snap.data() as {
    draft: ProjectDraftPayload;
    version?: number;
    chatHistory?: { role: string; content: string; at: unknown }[];
    source?: { attachedFileIds?: string[] };
  };

  const attachedIds = stored.draft?.source?.attachedFileIds ?? [];
  const prompt = buildUpdatePrompt({
    language: input.language,
    existingDraft: stored.draft,
    userMessage: input.userMessage,
    attachedFileIds: attachedIds,
  });

  const updated = await generateDraftWithGemini(prompt, { retryInvalidJson: true });
  const draft = projectDraftSchema.parse(updated);
  const version = (stored.version ?? 1) + 1;

  const userMsg = {
    role: "user" as const,
    content: input.userMessage,
    at: Timestamp.now(),
  };
  const assistantMsg = {
    role: "assistant" as const,
    content: `Updated draft (v${version}). ${draft.summary.slice(0, 280)}`,
    at: Timestamp.now(),
  };

  await draftRef.update({
    draft,
    version,
    chatHistory: FieldValue.arrayUnion(userMsg, assistantMsg),
    updatedAt: FieldValue.serverTimestamp(),
  });

  return { draft, version };
}

function projectWriteFields(
  access: Awaited<ReturnType<typeof assertWorkspaceAccess>>,
  uid: string
): Record<string, unknown> {
  if (access.isPersonal) {
    return {
      ownerId: uid,
      workspaceType: "personal",
      workspaceId: uid,
    };
  }
  return {
    orgId: access.orgId,
    workspaceType: "team",
    workspaceId: access.orgId,
  };
}

export async function handleCreateProjectFromDraft(
  authUid: string | undefined,
  data: unknown
): Promise<{ projectId: string }> {
  const input = createInputSchema.parse(data);
  if (!authUid) throw new functionsPermissionError("Authentication required.");

  const access = await assertWorkspaceAccess(
    db,
    authUid,
    input.workspaceId,
    input.companyId
  );
  assertProjectCreatePermission(access);

  const draftRef = db.doc(
    `workspaces/${access.storageKey}/projectDrafts/${input.draftId}`
  );
  const snap = await draftRef.get();
  if (!snap.exists) throw new Error("Draft not found.");

  const stored = snap.data() as {
    draft: ProjectDraftPayload;
    jobType?: string;
    contactMode?: string;
    contactId?: string | null;
    newContact?: Record<string, unknown> | null;
    inputDescription?: string;
    location?: string | null;
    status?: string;
  };

  if (stored.status === "confirmed") {
    throw new Error("Draft was already converted to a project.");
  }

  const draft = projectDraftSchema.parse(stored.draft);
  let customerId: string | null = draft.customer.contactId;

  if (draft.customer.mode === "new") {
    const nc = stored.newContact as {
      name?: string;
      email?: string;
      phone?: string;
      type?: string;
      address?: string;
      ico?: string;
      dic?: string;
    } | null;
    const name = draft.customer.name ?? nc?.name;
    if (!name) throw new Error("Customer name is required.");
    const custRef = await db.collection("customers").add({
      name,
      email: draft.customer.email ?? nc?.email ?? null,
      phone: draft.customer.phone ?? nc?.phone ?? null,
      type: nc?.type === "company" ? "company" : "person",
      address: nc?.address ?? null,
      ico: nc?.ico ?? null,
      taxId: nc?.dic ?? null,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
      ...projectWriteFields(access, authUid),
    });
    customerId = custRef.id;
  } else if (draft.customer.mode === "existing" && stored.contactId) {
    customerId = stored.contactId;
  } else {
    customerId = null;
  }

  const jobTypeRaw = stored.jobType ?? draft.projectType;
  const engine = mapArchetypeToFirestoreFields(String(jobTypeRaw ?? ""));
  const projectRef = await db.collection("projects").add({
    name: draft.projectTitle,
    projectType: engine?.projectType ?? "TRADE",
    workType: engine?.workType ?? "REPAIR",
    ...(engine?.jobArchetype ? { jobArchetype: engine.jobArchetype } : {}),
    ...(engine?.jobWorkflowKind ? { jobWorkflowKind: engine.jobWorkflowKind } : {}),
    phase: "sales",
    lifecycleStatus: "new_request",
    salesStatus: "draft",
    quoteStatus: "none",
    customerRequest: stored.inputDescription ?? draft.summary,
    customerId: customerId ?? null,
    customerName: draft.customer.name,
    customerEmail: draft.customer.email,
    customerPhone: draft.customer.phone,
    addressText: draft.location ?? stored.location ?? null,
    aiSummary: draft.summary,
    source: "ai",
    creationMethod: "ai",
    aiDraftId: input.draftId,
    createdByAI: true,
    confirmedByUser: true,
    attachedFileIds: draft.source.attachedFileIds ?? [],
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
    ...projectWriteFields(access, authUid),
  });

  const projectId = projectRef.id;
  const batch = db.batch();
  let order = 0;
  let quoteOrder = 0;

  // Build phases subcollection (mobile/office dashboard reads projects/{id}/phases).
  const phaseIdByKey = new Map<string, string>();
  const phaseNamesInOrder: string[] = [];
  for (const task of draft.tasks) {
    const phaseName = task.phase?.trim() || "";
    if (!phaseName) continue;
    const key = phaseName.toLowerCase();
    if (phaseIdByKey.has(key)) continue;
    const phaseId = db.collection("_").doc().id;
    phaseIdByKey.set(key, phaseId);
    phaseNamesInOrder.push(phaseName);
    batch.set(db.doc(`projects/${projectId}/phases/${phaseId}`), {
      projectId,
      ownerId: authUid,
      name: phaseName,
      order: phaseNamesInOrder.length - 1,
      status: "ACTIVE",
      createdAt: FieldValue.serverTimestamp(),
    });
  }

  for (const task of draft.tasks) {
    const phaseName = task.phase?.trim() || "";
    const phaseId = phaseName ? phaseIdByKey.get(phaseName.toLowerCase()) ?? null : null;
    const taskRef = db.collection(`projects/${projectId}/tasks`).doc();
    batch.set(taskRef, {
      projectId,
      ownerId: authUid,
      title: task.title,
      description: task.description,
      phase: phaseName || null,
      phaseTitle: phaseName || null,
      phaseId,
      priority: task.priority,
      estimatedDuration: task.estimatedDuration,
      status: "OPEN",
      order: order++,
      required: false,
      assigneeId: null,
      assigneeName: null,
      isActive: true,
      origin: "CUSTOM",
      source: "ai",
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });
  }

  for (const mat of draft.materials) {
    const matRef = db.collection(`projects/${projectId}/materials`).doc();
    batch.set(matRef, {
      name: mat.name,
      quantity: mat.quantity ?? 1,
      unit: mat.unit ?? "ks",
      note: mat.note,
      createdAt: FieldValue.serverTimestamp(),
    });

    const quoteMatRef = db.collection(`projects/${projectId}/quoteItems`).doc();
    batch.set(quoteMatRef, {
      name: mat.name,
      description: mat.note ?? "",
      category: "material",
      qty: mat.quantity ?? 1,
      unit: mat.unit ?? "ks",
      unitPrice: 0,
      order: quoteOrder++,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });
  }

  for (const line of draft.offerPreparation.suggestedLineItems) {
    if (line.category === "material") {
      const title = line.title?.trim().toLowerCase() ?? "";
      const duplicate = draft.materials.some(
        (m) => (m.name?.trim().toLowerCase() ?? "") === title
      );
      if (duplicate) continue;
    }
    const itemRef = db.collection(`projects/${projectId}/quoteItems`).doc();
    batch.set(itemRef, {
      name: line.title,
      description: line.description,
      category: line.category === "work" ? "work" : "material",
      qty: line.quantity ?? 1,
      unit: line.unit ?? "ks",
      unitPrice: 0,
      order: quoteOrder++,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });
  }

  await batch.commit();

  await draftRef.update({
    status: "confirmed",
    projectId,
    confirmedAt: FieldValue.serverTimestamp(),
    confirmedBy: authUid,
    updatedAt: FieldValue.serverTimestamp(),
  });

  return { projectId };
}
