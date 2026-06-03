import * as admin from "firebase-admin";
import { FieldValue, Timestamp } from "firebase-admin/firestore";
import { draftLanguageSchema, projectDraftSchema, type ProjectDraftPayload } from "./draftSchema";
import { extractFileText, loadDraftFiles } from "./files";
import { mapArchetypeToFirestoreFields } from "./projectArchetype";
import {
  assertProjectCreatePermission,
  assertWorkspaceAccess,
  functionsPermissionError,
} from "./permissions";
import { buildGeneratePrompt, buildUpdatePrompt, generateDraftWithGemini } from "./gemini";
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
): Promise<{ draftId: string; draft: ProjectDraftPayload; warnings?: string[] }> {
  const input = generateInputSchema.parse(data);
  assertAuth(authUid, input.userId);

  const access = await assertWorkspaceAccess(
    db,
    input.userId,
    input.workspaceId,
    input.companyId
  );
  assertProjectCreatePermission(access);

  const files = await loadDraftFiles(db, access.storageKey, input.attachedFileIds);
  const warnings: string[] = [];
  const documentTexts: { fileName: string; text: string }[] = [];
  const imageNotes: string[] = [];

  for (const file of files) {
    const extracted =
      file.extractedText ?
        { text: file.extractedText, status: "ok" as const }
      : await extractFileText(bucket, file);
    if (extracted.status !== "ok" && extracted.note) {
      warnings.push(`${file.fileName}: ${extracted.note}`);
    }
    if (extracted.text) {
      documentTexts.push({ fileName: file.fileName, text: extracted.text });
    }
    if (file.mimeType?.startsWith("image/")) {
      imageNotes.push(`Image file: ${file.fileName} (${file.storagePath})`);
    }
  }

  const contactSummary = await loadContactSummary(
    access,
    input.userId,
    input.contactMode,
    input.contactId,
    input.newContact
  );

  const prompt = buildGeneratePrompt({
    language: input.language,
    jobType: input.jobType,
    contactMode: input.contactMode,
    contactSummary,
    description: input.description,
    location: input.location,
    documentTexts,
    imageNotes,
  });

  let rawDraft = await generateDraftWithGemini(
    `${prompt}\n\nAttached file IDs: ${JSON.stringify(input.attachedFileIds ?? [])}`,
    { retryInvalidJson: true }
  );
  rawDraft = mergeCustomerIntoDraft(rawDraft, input);
  const draft = projectDraftSchema.parse(rawDraft);

  const draftRef = db.collection(`workspaces/${access.storageKey}/projectDrafts`).doc();
  const chatMessage = {
    role: "assistant" as const,
    content: draft.summary,
    at: Timestamp.now(),
  };

  await draftRef.set({
    draft,
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

  return { draftId: draftRef.id, draft, warnings: warnings.length ? warnings : undefined };
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
  for (const task of draft.tasks) {
    const taskRef = db.collection(`projects/${projectId}/tasks`).doc();
    batch.set(taskRef, {
      title: task.title,
      description: task.description,
      phase: task.phase,
      priority: task.priority,
      estimatedDuration: task.estimatedDuration,
      status: "OPEN",
      order: order++,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });
  }

  for (const mat of draft.materials) {
    const matRef = db.collection(`projects/${projectId}/materials`).doc();
    batch.set(matRef, {
      name: mat.name,
      quantity: mat.quantity,
      unit: mat.unit,
      note: mat.note,
      createdAt: FieldValue.serverTimestamp(),
    });
  }

  let qi = 0;
  for (const line of draft.offerPreparation.suggestedLineItems) {
    const itemRef = db.collection(`projects/${projectId}/quoteItems`).doc();
    batch.set(itemRef, {
      name: line.title,
      description: line.description,
      category: line.category === "work" ? "work" : "material",
      qty: line.quantity ?? 1,
      unit: line.unit ?? "ks",
      unitPrice: 0,
      order: qi++,
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
