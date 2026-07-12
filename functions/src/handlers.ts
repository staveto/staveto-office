import * as admin from "firebase-admin";
import { FieldValue, Timestamp } from "firebase-admin/firestore";
import { draftLanguageSchema, parseProjectDraftPayload, projectDraftSchema, type ProjectDraftPayload } from "./draftSchema";
import {
  extractFileText,
  collectDraftFilesForGeneration,
  collectProjectImportFilesAdmin,
  linkDraftFilesToProjectDocuments,
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
import { sanitizeForFirestore } from "./utils/firestoreSanitizer";
import { enrichDraftMaterialSuggestions } from "./materialQuantityFromFacts";
import { z } from "zod";

function withEnrichedMaterialQuantities(
  draft: ProjectDraftPayload,
  attachmentSummaries: AttachmentSummary[] = []
): ProjectDraftPayload {
  const enriched = enrichDraftMaterialSuggestions({
    materialSuggestions: draft.materialSuggestions,
    projectFacts: draft.projectFacts,
    attachmentFindings: attachmentSummaries,
  });
  if (!enriched.length) return draft;
  return { ...draft, materialSuggestions: enriched };
}

function buildInitialQuoteDraftNotes(projectFacts?: ProjectDraftPayload["projectFacts"]): string | null {
  if (!projectFacts) return null;
  const hasRooms = (projectFacts.rooms?.length ?? 0) > 0;
  const hasDimensions = (projectFacts.dimensions?.length ?? 0) > 0;
  const hasArea = (projectFacts.totalKnownAreaM2 ?? 0) > 0;
  const hasType = Boolean(projectFacts.buildingType?.trim());
  if (!hasRooms && !hasDimensions && !hasArea && !hasType) return null;

  return JSON.stringify({
    aiSetupMeta: {
      projectFacts: {
        buildingType: projectFacts.buildingType,
        totalKnownAreaM2: projectFacts.totalKnownAreaM2,
        rooms: projectFacts.rooms,
        dimensions: projectFacts.dimensions,
      },
    },
  });
}

if (!admin.apps.length) {
  admin.initializeApp();
}

const db = admin.firestore();
try {
  db.settings({ ignoreUndefinedProperties: true });
} catch {
  // settings() may throw if already configured by another module
}
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

function buildDraftAttachedFileIds(
  attachedFileIds: string[] | undefined,
  documentStoragePaths: string[] | undefined
): string[] {
  const ids = new Set<string>();
  for (const id of attachedFileIds ?? []) {
    const trimmed = id?.trim();
    if (trimmed) ids.add(trimmed);
  }
  for (const rawPath of documentStoragePaths ?? []) {
    const path = rawPath?.trim();
    if (!path) continue;
    ids.add(path.startsWith("path:") ? path : `path:${path}`);
  }
  return [...ids];
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
      attachedFileIds: buildDraftAttachedFileIds(
        input.attachedFileIds,
        input.documentStoragePaths
      ),
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
  const draft = sanitizeDraftMaterials(
    withEnrichedMaterialQuantities(
      parseProjectDraftPayload(rawDraft),
      attachmentSummaries
    )
  );

  const draftRef = db.collection(`workspaces/${access.storageKey}/projectDrafts`).doc();
  const chatMessage = {
    role: "assistant" as const,
    content: draft.summary,
    at: Timestamp.now(),
  };

  await draftRef.set(
    sanitizeForFirestore({
      draft,
      attachmentSummaries: attachmentSummaries.length ? attachmentSummaries : null,
      attachmentProcessing,
      attachmentStoragePaths: input.documentStoragePaths ?? [],
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
    })
  );

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
    attachmentStoragePaths?: string[];
  };

  const attachedIds = stored.draft?.source?.attachedFileIds ?? [];
  const prompt = buildUpdatePrompt({
    language: input.language,
    existingDraft: stored.draft,
    userMessage: input.userMessage,
    attachedFileIds: attachedIds,
  });

  const updated = await generateDraftWithGemini(prompt, { retryInvalidJson: true });
  const draft = parseProjectDraftPayload(updated);
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

  await draftRef.update(
    sanitizeForFirestore({
      draft,
      version,
      chatHistory: FieldValue.arrayUnion(userMsg, assistantMsg),
      updatedAt: FieldValue.serverTimestamp(),
    })
  );

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
    attachmentSummaries?: AttachmentSummary[];
    attachmentStoragePaths?: string[];
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

  const draft = withEnrichedMaterialQuantities(
    projectDraftSchema.parse(stored.draft),
    stored.attachmentSummaries ?? []
  );
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
  const initialQuoteNotes = buildInitialQuoteDraftNotes(draft.projectFacts);
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
    ...(initialQuoteNotes ? { quoteDraftNotes: initialQuoteNotes } : {}),
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
    ...projectWriteFields(access, authUid),
  });

  const projectId = projectRef.id;
  const batch = db.batch();
  let order = 0;
  let quoteOrder = 0;
  const quoteItemNames = new Set<string>();

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
    quoteItemNames.add(mat.name.trim().toLowerCase());
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
    if (line.category !== "work") {
      quoteItemNames.add(line.title.trim().toLowerCase());
    }
  }

  for (const suggestion of draft.materialSuggestions ?? []) {
    const name = suggestion.name?.trim();
    if (!name) continue;
    const sugRef = db.collection(`projects/${projectId}/materialSuggestions`).doc();
    batch.set(sugRef, {
      projectId,
      name,
      category: suggestion.category ?? null,
      description: suggestion.sourceNote?.trim() ?? null,
      suggestedQuantity: suggestion.quantity ?? null,
      unit: suggestion.unit ?? null,
      confidence: suggestion.confidence ?? null,
      source: "ai",
      sourceNote: suggestion.sourceNote?.trim() ?? null,
      status: "planned",
      createdBy: authUid,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });

    const nameKey = name.toLowerCase();
    if (!quoteItemNames.has(nameKey)) {
      quoteItemNames.add(nameKey);
      const itemRef = db.collection(`projects/${projectId}/quoteItems`).doc();
      batch.set(itemRef, {
        name,
        description: suggestion.sourceNote?.trim() ?? "",
        category: "material",
        qty: suggestion.quantity && suggestion.quantity > 0 ? suggestion.quantity : 1,
        unit: suggestion.unit ?? "ks",
        unitPrice: 0,
        order: quoteOrder++,
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      });
    }
  }

  await batch.commit();

  const attachmentFiles = await collectDraftFilesForGeneration({
    db,
    storageKey: access.storageKey,
    authUid,
    attachedFileIds: draft.source.attachedFileIds ?? [],
    documentStoragePaths: stored.attachmentStoragePaths ?? [],
  });
  if (attachmentFiles.files.length > 0) {
    const { storagePaths } = await linkDraftFilesToProjectDocuments(
      db,
      projectId,
      authUid,
      attachmentFiles.files
    );
    if (storagePaths.length > 0) {
      await projectRef.update({
        aiWizardAttachmentPaths: storagePaths,
        updatedAt: FieldValue.serverTimestamp(),
      });
    }
  }

  await draftRef.update({
    status: "confirmed",
    projectId,
    confirmedAt: FieldValue.serverTimestamp(),
    confirmedBy: authUid,
    updatedAt: FieldValue.serverTimestamp(),
  });

  return { projectId };
}

const importProjectAttachmentsInputSchema = z.object({
  projectId: z.string().min(1),
});

export type ImportProjectDraftAttachmentsResponse = {
  documents: Array<{
    id: string;
    projectId: string;
    fileName: string;
    mimeType: string;
    storagePath: string;
  }>;
  errors: string[];
};

async function assertCanAccessProject(
  authUid: string,
  project: Record<string, unknown>
): Promise<void> {
  const ownerId = String(project.ownerId ?? "");
  if (ownerId === authUid) return;

  const orgId = project.orgId ? String(project.orgId) : "";
  if (!orgId) {
    throw new functionsPermissionError("Project not found or access denied.");
  }

  const orgSnap = await db.doc(`organizations/${orgId}`).get();
  if (!orgSnap.exists) {
    throw new functionsPermissionError("Project not found or access denied.");
  }
  const org = orgSnap.data() as { ownerUid?: string };
  if (org.ownerUid === authUid) return;

  const memberSnap = await db.doc(`organizations/${orgId}/members/${authUid}`).get();
  if (!memberSnap.exists) {
    throw new functionsPermissionError("Project not found or access denied.");
  }
  const member = memberSnap.data() as { status?: string };
  const status = member.status?.toLowerCase?.() ?? member.status;
  if (status === "removed" || status === "invited") {
    throw new functionsPermissionError("Project not found or access denied.");
  }
}

function mapProjectDocumentRecords(
  projectId: string,
  snap: admin.firestore.QuerySnapshot
): ImportProjectDraftAttachmentsResponse["documents"] {
  return snap.docs.map((docSnap) => {
    const data = docSnap.data() as Record<string, unknown>;
    return {
      id: docSnap.id,
      projectId,
      fileName: String(data.fileName ?? "file"),
      mimeType: String(data.mimeType ?? "application/octet-stream"),
      storagePath: String(data.storagePath ?? ""),
    };
  });
}

export async function handleImportProjectDraftAttachments(
  authUid: string | undefined,
  data: unknown
): Promise<ImportProjectDraftAttachmentsResponse> {
  if (!authUid) throw new functionsPermissionError("Authentication required.");
  const input = importProjectAttachmentsInputSchema.parse(data);
  const projectId = input.projectId;

  const projectSnap = await db.doc(`projects/${projectId}`).get();
  if (!projectSnap.exists) {
    throw new functionsPermissionError("Project not found.");
  }
  const project = projectSnap.data() as Record<string, unknown>;
  await assertCanAccessProject(authUid, project);

  const existingSnap = await db.collection(`projects/${projectId}/documents`).get();
  if (existingSnap.size > 0) {
    return { documents: mapProjectDocumentRecords(projectId, existingSnap), errors: [] };
  }

  const allFiles = await collectProjectImportFilesAdmin(db, project, authUid);
  if (allFiles.length === 0) {
    return { documents: [], errors: [] };
  }

  try {
    const { documents, storagePaths } = await linkDraftFilesToProjectDocuments(
      db,
      projectId,
      authUid,
      allFiles
    );
    if (storagePaths.length > 0) {
      await db.doc(`projects/${projectId}`).update({
        aiWizardAttachmentPaths: storagePaths,
        updatedAt: FieldValue.serverTimestamp(),
      });
    }
    return { documents, errors: [] };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { documents: [], errors: [msg] };
  }
}

const projectDocumentUrlInputSchema = z.object({
  projectId: z.string().min(1),
  storagePath: z.string().min(1),
});

function collectAllowedProjectStoragePaths(project: Record<string, unknown>): Set<string> {
  const allowed = new Set<string>();
  for (const raw of (project.aiWizardAttachmentPaths as string[]) ?? []) {
    const path = String(raw).trim();
    if (path) allowed.add(path);
  }
  for (const id of (project.attachedFileIds as string[]) ?? []) {
    if (!id) continue;
    if (id.startsWith("path:")) allowed.add(id.slice("path:".length));
    else if (id.includes("/")) allowed.add(id);
  }
  return allowed;
}

async function assertProjectDocumentStoragePath(
  projectId: string,
  project: Record<string, unknown>,
  storagePath: string
): Promise<void> {
  if (storagePath.startsWith(`projects/${projectId}/documents/`)) return;

  const allowed = collectAllowedProjectStoragePaths(project);
  if (allowed.has(storagePath)) return;

  const docSnap = await db
    .collection(`projects/${projectId}/documents`)
    .where("storagePath", "==", storagePath)
    .limit(1)
    .get();
  if (!docSnap.empty) return;

  throw new functionsPermissionError("Document is not linked to this project.");
}

export async function handleGetProjectDocumentDownloadUrl(
  authUid: string | undefined,
  data: unknown
): Promise<{ url: string }> {
  if (!authUid) throw new functionsPermissionError("Authentication required.");
  const input = projectDocumentUrlInputSchema.parse(data);
  const { projectId, storagePath } = input;

  const projectSnap = await db.doc(`projects/${projectId}`).get();
  if (!projectSnap.exists) {
    throw new functionsPermissionError("Project not found.");
  }
  const project = projectSnap.data() as Record<string, unknown>;
  await assertCanAccessProject(authUid, project);
  await assertProjectDocumentStoragePath(projectId, project, storagePath);

  const [url] = await bucket.file(storagePath).getSignedUrl({
    action: "read",
    expires: Date.now() + 60 * 60 * 1000,
  });
  return { url };
}
