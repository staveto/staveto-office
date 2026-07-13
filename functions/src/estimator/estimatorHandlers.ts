import { convertTechnicalDrawingFactsToEstimatorItems, ELECTRICAL_EXECUTION_PHASES, validateEstimatorFacts } from "./symbolReading";
import { writeEstimatorMaterialsToProject } from "./estimatorProjectMaterials";
import { resolveCustomerScopeOfWork } from "./customerScope";
import type { EstimatorFactsPayload, QuoteDraftPayload } from "./estimatorSchema";
import { mapArchetypeToFirestoreFields } from "../projectArchetype";
import { sanitizeForFirestore } from "../utils/firestoreSanitizer";
import {
  assertProjectCreatePermission,
  assertWorkspaceAccess,
} from "../permissions";
import {
  collectDraftFilesForGeneration,
  isVisualAttachmentMime,
  loadVisualAttachment,
} from "../files";
import { extractFactsFromAttachment, extractFactsFromTextOnly, generateEstimateLinesFromFacts, generateQuoteDraftFromFacts } from "./estimatorGemini";
import { buildEstimatorKnowledgeContext } from "./knowledgeContext";
import { mergeEstimatorFactsStrict } from "./estimatorMerge";
import { splitPdfIntoPages } from "./pdfPageSplit";
import { draftLanguageSchema } from "../draftSchema";
import { z } from "zod";
import * as admin from "firebase-admin";
import { FieldValue } from "firebase-admin/firestore";

if (!admin.apps.length) {
  admin.initializeApp();
}

const db = admin.firestore();
const bucket = admin.storage().bucket();

function nullishToOptional<T extends z.ZodTypeAny>(schema: T) {
  return z.preprocess((val) => (val === null ? undefined : val), schema);
}
const optionalString = nullishToOptional(z.string().optional());
const optionalStringArray = nullishToOptional(z.array(z.string()).optional());
const optionalNumber = nullishToOptional(z.number().optional());

const nullishString = (fallback: string) =>
  z.preprocess((val) => {
    if (val === null || val === undefined || val === "") return fallback;
    return val;
  }, z.string());

const nullishNumber = (fallback: number) =>
  z.preprocess((val) => {
    if (val === null || val === undefined || Number.isNaN(val)) return fallback;
    return val;
  }, z.number());

const countryProfileSchema = z.object({
  countryCode: nullishString("SK"),
  language: nullishString("sk"),
  currency: nullishString("EUR"),
  vatPercent: nullishNumber(20),
  legalQuoteNotes: z.preprocess(
    (val) => (val == null ? [] : val),
    z.array(z.string()).default([])
  ),
  tradeTerminology: nullishString("construction"),
  defaultHourlyRate: optionalNumber,
  defaultTravelRate: optionalNumber,
});

const factsInputSchema = z.object({
  workspaceId: z.string(),
  companyId: optionalString,
  userId: z.string(),
  jobType: z.string().default("other"),
  description: z.string().min(1),
  location: optionalString,
  language: draftLanguageSchema,
  attachedFileIds: optionalStringArray,
  documentStoragePaths: optionalStringArray,
  customerName: optionalString,
  countryProfile: countryProfileSchema.optional(),
  enableSymbolReading: z.boolean().optional(),
  debug: z.boolean().optional(),
});

function debugLog(enabled: boolean | undefined, event: string, payload: Record<string, unknown>) {
  if (!enabled && process.env.AI_ESTIMATOR_DEBUG !== "1") return;
  console.info(`[ai-estimator] ${event}`, payload);
}

function sessionRef(storageKey: string, sessionId: string) {
  return db.collection("workspaces").doc(storageKey).collection("aiEstimatorSessions").doc(sessionId);
}

export async function handleGenerateEstimatorFacts(
  uid: string | undefined,
  data: unknown
): Promise<{
  sessionId: string;
  facts: EstimatorFactsPayload;
  diagnostics: Record<string, unknown>;
  usedFallback: false;
}> {
  if (!uid) throw new Error("Sign in required.");
  const input = factsInputSchema.parse(data);
  if (input.userId !== uid) throw new Error("userId mismatch.");

  const access = await assertWorkspaceAccess(db, uid, input.workspaceId, input.companyId);
  assertProjectCreatePermission(access);

  const profile = input.countryProfile ?? {
    countryCode: "SK",
    language: input.language,
    currency: "EUR",
    vatPercent: 20,
    legalQuoteNotes: [],
    tradeTerminology: input.jobType,
  };

  const { files, attachmentProcessing } = await collectDraftFilesForGeneration({
    db,
    storageKey: access.storageKey,
    authUid: uid,
    attachedFileIds: input.attachedFileIds,
    documentStoragePaths: input.documentStoragePaths,
  });

  const sessionId = db.collection("_").doc().id;

  // Structured knowledge context (symbol aliases, assemblies, labor hints) —
  // compact, country/trade scoped, built once per session. Never the whole DB.
  let knowledgeContext = "";
  try {
    knowledgeContext = await buildEstimatorKnowledgeContext({
      countryCode: profile.countryCode,
      trade: "electrical",
      orgId: input.companyId ?? undefined,
    });
  } catch {
    knowledgeContext = "";
  }

  const parts: EstimatorFactsPayload[] = [];
  let visionUsed = false;
  let textOnlyUsed = false;
  let textLayerUsed = false;
  let pageByPageUsed = false;
  let pageByPageFallbackReason: string | undefined;
  const fileNames: string[] = [];
  const mimeTypes: string[] = [];
  const fileSizes: number[] = [];

  for (const file of files) {
    fileNames.push(file.fileName);
    mimeTypes.push(file.mimeType || "unknown");
    if (!isVisualAttachmentMime(file.mimeType || "")) continue;
    const visual = await loadVisualAttachment(bucket, file);
    if (!visual) continue;
    fileSizes.push(visual.bytes.length);
    visionUsed = true;
    const extractedText =
      typeof file.extractedText === "string" && file.extractedText.trim().length > 40
        ? file.extractedText.trim()
        : undefined;
    if (extractedText) textLayerUsed = true;

    const mime = (visual.mimeType || file.mimeType || "").toLowerCase();
    const isPdf = mime === "application/pdf" || file.fileName.toLowerCase().endsWith(".pdf");

    try {
      if (isPdf) {
        const split = await splitPdfIntoPages(visual.bytes, visual.fileName);
        if (split.ok && split.pages.length > 1) {
          pageByPageUsed = true;
          if (split.truncated) {
            parts.push({
              sessionId,
              detectedDocumentTypes: [],
              inputSummary: "",
              rooms: [],
              extractedItems: [],
              inferredItems: [],
              missingQuestions: [
                {
                  id: "pdf_pages_truncated",
                  question: `Dokument má ${split.pageCount} strán — spracovaných bolo len prvých ${split.pages.length}. Skontrolujte zvyšok manuálne.`,
                  reason: "Page limit for estimator page-by-page extraction.",
                  importance: "important",
                  blocksFixedQuote: false,
                },
              ],
              risks: [],
              confidence: "medium",
              warnings: [`PDF truncated to ${split.pages.length} of ${split.pageCount} pages.`],
              drawingRegions: [],
              legendEntries: [],
              symbolOccurrences: [],
              unknownSymbols: [],
              companyFocus: [],
            });
          }
          for (const page of split.pages) {
            try {
              const part = await extractFactsFromAttachment({
                language: input.language,
                countryCode: profile.countryCode,
                currency: profile.currency,
                tradeType: profile.tradeTerminology || input.jobType,
                attachment: {
                  fileId: file.storagePath,
                  fileName: visual.fileName,
                  mimeType: "application/pdf",
                  bytes: page.bytes,
                  extractedText:
                    page.pageNumber === 1 ? extractedText : undefined,
                  pageNumber: page.pageNumber,
                },
                sessionId,
                enableSymbolReading: input.enableSymbolReading !== false,
                knowledgeContext,
              });
              parts.push(part);
            } catch (e) {
              debugLog(input.debug, "page_extract_failed", {
                fileName: file.fileName,
                page: page.pageNumber,
                message: e instanceof Error ? e.message : String(e),
              });
            }
          }
          continue;
        }
        if (!split.ok) {
          pageByPageFallbackReason = split.reason;
        }
      }

      const part = await extractFactsFromAttachment({
        language: input.language,
        countryCode: profile.countryCode,
        currency: profile.currency,
        tradeType: profile.tradeTerminology || input.jobType,
        attachment: {
          fileId: file.storagePath,
          fileName: visual.fileName,
          mimeType: visual.mimeType,
          bytes: visual.bytes,
          extractedText,
        },
        sessionId,
        enableSymbolReading: input.enableSymbolReading !== false,
        knowledgeContext,
      });
      parts.push(part);
    } catch (e) {
      debugLog(input.debug, "attachment_extract_failed", {
        fileName: file.fileName,
        message: e instanceof Error ? e.message : String(e),
      });
    }
  }

  if (parts.length === 0) {
    textOnlyUsed = true;
    parts.push(
      await extractFactsFromTextOnly({
        language: input.language,
        countryCode: profile.countryCode,
        currency: profile.currency,
        tradeType: profile.tradeTerminology || input.jobType,
        description: input.description,
        location: input.location,
        sessionId,
      })
    );
  } else if (input.description.trim().length > 20) {
    // Enrich with text interpretation without replacing document rows
    try {
      const textPart = await extractFactsFromTextOnly({
        language: input.language,
        countryCode: profile.countryCode,
        currency: profile.currency,
        tradeType: profile.tradeTerminology || input.jobType,
        description: input.description,
        location: input.location,
        sessionId,
      });
      parts.push({
        ...textPart,
        extractedItems: textPart.extractedItems.filter((i) => i.origin === "from_user_text"),
        inferredItems: textPart.inferredItems,
      });
      textOnlyUsed = true;
    } catch {
      /* ignore text enrichment failures */
    }
  }

  const merged = mergeEstimatorFactsStrict(sessionId, parts);
  const converted = convertTechnicalDrawingFactsToEstimatorItems(merged);
  const validation = validateEstimatorFacts(converted, { visionUsed, textOnlyUsed });
  const facts: EstimatorFactsPayload = {
    ...converted,
    warnings: [...new Set([...converted.warnings, ...validation.warnings])],
  };
  const diagnostics = {
    uploadedFileCount: attachmentProcessing.uploadedFileCount,
    fileNames,
    mimeTypes,
    fileSizes,
    detectedDocumentTypes: facts.detectedDocumentTypes,
    textLayerUsed,
    visionUsed,
    pageByPageUsed,
    pageByPageFallbackReason: pageByPageFallbackReason ?? null,
    roomCount: facts.rooms.length,
    extractedItemCount: facts.extractedItems.length,
    inferredItemCount: facts.inferredItems.length,
    missingQuestionCount: facts.missingQuestions.length,
    riskCount: facts.risks.length,
    legendEntryCount: facts.legendEntries?.length ?? 0,
    symbolOccurrenceCount: facts.symbolOccurrences?.length ?? 0,
    unknownSymbolCount: facts.unknownSymbols?.length ?? 0,
    companyFocusCount: facts.companyFocus?.length ?? 0,
    symbolReadingUsed: input.enableSymbolReading !== false,
    indicativeQuote: validation.indicative,
    textOnlyUsed,
  };

  debugLog(input.debug, "facts_ready", diagnostics);

  await sessionRef(access.storageKey, sessionId).set(
    sanitizeForFirestore({
      id: sessionId,
      workspaceId: access.storageKey,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
      createdBy: uid,
      status: "facts",
      jobType: input.jobType,
      description: input.description,
      location: input.location ?? null,
      customerName: input.customerName ?? null,
      countryProfile: profile,
      language: input.language,
      facts,
      diagnostics,
    })
  );

  return { sessionId, facts, diagnostics, usedFallback: false };
}

const estimateInputSchema = z.object({
  workspaceId: z.string(),
  companyId: optionalString,
  sessionId: z.string(),
  marginPercent: optionalNumber,
  debug: z.boolean().optional(),
});

export async function handleGenerateEstimateDraft(uid: string | undefined, data: unknown) {
  if (!uid) throw new Error("Sign in required.");
  const input = estimateInputSchema.parse(data);
  const access = await assertWorkspaceAccess(db, uid, input.workspaceId, input.companyId);
  assertProjectCreatePermission(access);

  const snap = await sessionRef(access.storageKey, input.sessionId).get();
  if (!snap.exists) throw new Error("Estimator session not found.");
  const session = snap.data() as {
    facts: EstimatorFactsPayload;
    countryProfile?: {
      countryCode: string;
      currency: string;
      vatPercent: number;
      defaultHourlyRate?: number;
      defaultTravelRate?: number;
    };
    language: "sk" | "de" | "en";
  };

  const profile = session.countryProfile ?? {
    countryCode: "SK",
    currency: "EUR",
    vatPercent: 20,
  };

  const lines = await generateEstimateLinesFromFacts({
    language: session.language,
    countryCode: profile.countryCode,
    currency: profile.currency,
    vatPercent: profile.vatPercent,
    hourlyRate: profile.defaultHourlyRate,
    travelRate: profile.defaultTravelRate,
    marginPercent: input.marginPercent ?? 20,
    facts: session.facts,
  });

  await sessionRef(access.storageKey, input.sessionId).set(
    sanitizeForFirestore({
      estimateLines: lines,
      status: "estimate",
      updatedAt: FieldValue.serverTimestamp(),
    }),
    { merge: true }
  );

  debugLog(input.debug, "estimate_ready", { sessionId: input.sessionId, lineCount: lines.length });
  return { sessionId: input.sessionId, lines };
}

const quoteInputSchema = z.object({
  workspaceId: z.string(),
  companyId: optionalString,
  sessionId: z.string(),
  title: optionalString,
  debug: z.boolean().optional(),
});

export async function handleGenerateQuoteDraftFromEstimate(
  uid: string | undefined,
  data: unknown
) {
  if (!uid) throw new Error("Sign in required.");
  const input = quoteInputSchema.parse(data);
  const access = await assertWorkspaceAccess(db, uid, input.workspaceId, input.companyId);
  assertProjectCreatePermission(access);

  const snap = await sessionRef(access.storageKey, input.sessionId).get();
  if (!snap.exists) throw new Error("Estimator session not found.");
  const session = snap.data() as {
    facts: EstimatorFactsPayload;
    estimateLines?: QuoteDraftPayload["lines"];
    countryProfile?: {
      countryCode: string;
      currency: string;
      vatPercent: number;
      legalQuoteNotes?: string[];
    };
    language: "sk" | "de" | "en";
    customerName?: string | null;
    location?: string | null;
    description?: string;
  };

  let lines = session.estimateLines;
  if (!lines?.length) {
    const generated = await handleGenerateEstimateDraft(uid, {
      workspaceId: input.workspaceId,
      companyId: input.companyId,
      sessionId: input.sessionId,
      debug: input.debug,
    });
    lines = generated.lines;
  }

  const profile = session.countryProfile ?? {
    countryCode: "SK",
    currency: "EUR",
    vatPercent: 20,
    legalQuoteNotes: [],
  };

  const quoteDraft = await generateQuoteDraftFromFacts({
    language: session.language,
    countryCode: profile.countryCode,
    currency: profile.currency,
    vatPercent: profile.vatPercent,
    legalNotes: profile.legalQuoteNotes ?? [],
    title: input.title || session.facts.inputSummary.slice(0, 80) || "Cenová ponuka",
    customerName: session.customerName ?? undefined,
    projectAddress: session.location ?? undefined,
    facts: session.facts,
    lines,
  });

  await sessionRef(access.storageKey, input.sessionId).set(
    sanitizeForFirestore({
      quoteDraft,
      status: "quote_draft",
      updatedAt: FieldValue.serverTimestamp(),
    }),
    { merge: true }
  );

  debugLog(input.debug, "quote_draft_ready", {
    sessionId: input.sessionId,
    lineCount: quoteDraft.lines.length,
    total: quoteDraft.total ?? null,
  });

  return { sessionId: input.sessionId, quoteDraft };
}

const convertInputSchema = z.object({
  workspaceId: z.string(),
  companyId: optionalString,
  sessionId: z.string(),
  createQuoteDocument: z.boolean().optional(),
  projectTitle: optionalString,
  customerName: optionalString,
  customerCompanyName: optionalString,
  customerContactPersonName: optionalString,
  customerId: optionalString,
  customerEmail: optionalString,
  customerPhone: optionalString,
  addressText: optionalString,
  debug: z.boolean().optional(),
});

function buildEstimatorQuoteDraftNotes(params: {
  facts: EstimatorFactsPayload;
  quoteDraft?: QuoteDraftPayload;
  sessionDescription?: string;
  vatPercent: number;
}): string {
  const { facts, quoteDraft, sessionDescription, vatPercent } = params;
  // Customer PDF scope — never dump AI brief / drawing analysis / wizard metadata.
  const scopeOfWork = resolveCustomerScopeOfWork({
    noteToCustomer: quoteDraft?.noteToCustomer,
    facts,
  });

  const roomsFromFacts = (facts.rooms ?? []).map((r) => ({
    name: r.name,
    areaM2: r.areaM2,
  }));
  const roomNames = new Set(roomsFromFacts.map((r) => r.name.trim().toLowerCase()).filter(Boolean));
  for (const item of [...facts.extractedItems, ...facts.inferredItems]) {
    const name = item.roomName?.trim();
    if (!name) continue;
    const key = name.toLowerCase();
    if (roomNames.has(key)) continue;
    roomNames.add(key);
    roomsFromFacts.push({ name, areaM2: undefined });
  }
  const rooms = roomsFromFacts;

  const laborLines = (quoteDraft?.lines ?? []).filter(
    (l) => l.type === "labor" || l.type === "travel"
  );
  const laborHours = laborLines.reduce((sum, l) => {
    if (/hod|h|std/i.test(l.unit || "")) return sum + (l.quantity || 0);
    return sum;
  }, 0);
  const laborRate =
    laborLines.find((l) => (l.unitPrice ?? 0) > 0)?.unitPrice ??
    laborLines.find((l) => (l.unitCost ?? 0) > 0)?.unitCost ??
    85;

  let socketPts = 0;
  let switchPts = 0;
  let lightPts = 0;
  for (const i of facts.extractedItems) {
    const q =
      typeof i.computedQuantity === "number" && i.computedQuantity > 0
        ? i.computedQuantity
        : typeof i.quantity === "number" && i.quantity > 0
          ? i.quantity
          : 0;
    if (i.category === "socket") socketPts += q;
    if (i.category === "switch") switchPts += q;
    if (i.category === "lighting" || i.category === "led_strip") lightPts += q;
  }
  const pointHours = Math.round(socketPts * 0.35 + switchPts * 0.3 + lightPts * 0.25);
  const derivedHours =
    laborHours > 0
      ? Math.max(1, Math.round(laborHours))
      : pointHours > 0
        ? Math.max(8, pointHours + 6)
        : 16;

  const workNoteParts = [
    laborHours > 0
      ? "Odhad z AI cenovej ponuky — upravte podľa reality."
      : pointHours > 0
        ? `Orientačne z výkazu: ${socketPts} zásuviek, ${switchPts} vypínačov, ${lightPts} svetelných bodov/m.`
        : "Predbežný odhad práce — upravte podľa rozsahu.",
    "Typické práce: drážkovanie, kabeláž, osadenie rozvádzača, montáž vývodov, skúšky.",
  ];

  // Internal only — overview / AI setup, never printed as customer scope.
  const plainNotes = [facts.inputSummary?.trim(), sessionDescription?.trim()]
    .filter(Boolean)
    .filter((a, i, arr) => arr.indexOf(a) === i)
    .join("\n\n")
    .slice(0, 8000);

  return JSON.stringify({
    aiSetupMeta: {
      projectFacts: {
        rooms: rooms.length ? rooms : undefined,
        buildingType: facts.detectedDocumentTypes.includes("electrical_marking")
          ? "Elektroinštalácia"
          : undefined,
      },
      workEstimate: {
        workers: 2,
        hours: derivedHours,
        hourlyRate: laborRate || 85,
        note: workNoteParts.join(" "),
      },
      calculation: {
        marginPercent: 15,
        vatPercent,
        otherCosts: 0,
        materialTotalOverride: null,
        workTotalOverride: null,
        manualGrossTotal: null,
      },
    },
    quoteDocumentMeta: {
      scopeOfWork,
    },
    plainNotes,
  });
}

function projectWriteFields(access: Awaited<ReturnType<typeof assertWorkspaceAccess>>, uid: string) {
  if (access.isPersonal) {
    return {
      ownerId: uid,
      workspaceType: "personal" as const,
      workspaceId: uid,
    };
  }
  return {
    orgId: access.orgId,
    workspaceType: "team" as const,
    workspaceId: access.orgId,
    ownerId: uid,
  };
}

const ELECTRICAL_PHASES = [...ELECTRICAL_EXECUTION_PHASES];

export async function handleConvertEstimatorSessionToProject(
  uid: string | undefined,
  data: unknown
): Promise<{ projectId: string; quoteId?: string; sessionId: string }> {
  if (!uid) throw new Error("Sign in required.");
  const input = convertInputSchema.parse(data);
  const access = await assertWorkspaceAccess(db, uid, input.workspaceId, input.companyId);
  assertProjectCreatePermission(access);

  const snap = await sessionRef(access.storageKey, input.sessionId).get();
  if (!snap.exists) throw new Error("Estimator session not found.");
  const session = snap.data() as {
    facts: EstimatorFactsPayload;
    quoteDraft?: QuoteDraftPayload;
    estimateLines?: QuoteDraftPayload["lines"];
    jobType?: string;
    description?: string;
    location?: string | null;
    customerName?: string | null;
    countryProfile?: { currency: string; vatPercent: number; countryCode: string };
  };

  const facts = convertTechnicalDrawingFactsToEstimatorItems(session.facts);
  const lines = session.quoteDraft?.lines?.length
    ? session.quoteDraft.lines
    : session.estimateLines ?? [];

  const isElectrical = facts.detectedDocumentTypes.includes("electrical_marking");
  const phaseNames = isElectrical
    ? ELECTRICAL_PHASES
    : ["Príprava", "Realizácia", "Dokončenie a odovzdanie"];

  const now = FieldValue.serverTimestamp();
  const projectRef = db.collection("projects").doc();
  const archetype = mapArchetypeToFirestoreFields(session.jobType || "other");

  const projectTitle =
    (input.projectTitle?.trim() ||
      session.quoteDraft?.title?.trim() ||
      facts.inputSummary.slice(0, 80) ||
      "AI projekt").trim();

  const customerRequest = [
    session.description?.trim(),
    facts.inputSummary?.trim() &&
    facts.inputSummary.trim() !== session.description?.trim()
      ? facts.inputSummary.trim()
      : null,
  ]
    .filter(Boolean)
    .join("\n\n")
    .slice(0, 8000);

  const addressText =
    input.addressText?.trim() ||
    session.location?.trim() ||
    session.quoteDraft?.projectAddress?.trim() ||
    "";

  const vatPercent =
    session.quoteDraft?.vatPercent ??
    session.countryProfile?.vatPercent ??
    20;

  const quoteDraftNotes = buildEstimatorQuoteDraftNotes({
    facts,
    quoteDraft: session.quoteDraft,
    sessionDescription: session.description,
    vatPercent,
  });

  const projectData = {
    name: projectTitle,
    description: facts.inputSummary || session.description || "",
    customerRequest: customerRequest || facts.inputSummary || "",
    aiSummary: facts.inputSummary || "",
    ...archetype,
    ...projectWriteFields(access, uid),
    location: addressText || null,
    addressText: addressText || null,
    customerName:
      input.customerName?.trim() ||
      session.customerName ||
      session.quoteDraft?.customerName ||
      null,
    customerCompanyName: input.customerCompanyName?.trim() || null,
    customerContactPersonName: input.customerContactPersonName?.trim() || null,
    customerId: input.customerId?.trim() || null,
    customerEmail: input.customerEmail?.trim() || null,
    customerPhone: input.customerPhone?.trim() || null,
    phase: "sales",
    salesStatus: "draft",
    lifecycleStatus: "quote_drafted",
    quoteStatus: "draft",
    quoteDraftVatPercent: vatPercent,
    quoteDraftNotes,
    source: "ai",
    creationMethod: "ai",
    createdByAI: true,
    confirmedByUser: true,
    aiEstimatorSessionId: input.sessionId,
    status: "ACTIVE",
    createdAt: now,
    updatedAt: now,
    createdBy: uid,
  };

  const batch = db.batch();
  batch.set(projectRef, sanitizeForFirestore(projectData));

  const phaseIdByName = new Map<string, string>();
  phaseNames.forEach((name, order) => {
    const phaseRef = projectRef.collection("phases").doc();
    phaseIdByName.set(name, phaseRef.id);
    batch.set(
      phaseRef,
      sanitizeForFirestore({
        name,
        order,
        status: "ACTIVE",
        createdAt: now,
        updatedAt: now,
      })
    );
  });

  // Seed readable tasks linked to phases (not only phaseName string).
  phaseNames.forEach((phaseName, pi) => {
    const taskRef = projectRef.collection("tasks").doc();
    const phaseId = phaseIdByName.get(phaseName);
    batch.set(
      taskRef,
      sanitizeForFirestore({
        title: phaseName,
        description: [
          facts.inputSummary.slice(0, 400),
          facts.missingQuestions[pi]?.question
            ? `Otvorený bod: ${facts.missingQuestions[pi]!.question}`
            : null,
        ]
          .filter(Boolean)
          .join("\n\n"),
        phase: phaseName,
        phaseName: phaseName,
        phaseId: phaseId ?? null,
        status: "OPEN",
        priority: pi === 0 ? "high" : "medium",
        isActive: true,
        createdAt: now,
        updatedAt: now,
        createdBy: uid,
      })
    );
  });

  await batch.commit();

  const unitPriceByTitle = new Map<string, number>();
  for (const line of lines) {
    const title = (line.title ?? "").trim().toLowerCase();
    if (!title) continue;
    const price = line.unitPrice ?? line.unitCost ?? 0;
    if (price > 0) unitPriceByTitle.set(title, price);
  }

  await writeEstimatorMaterialsToProject({
    db,
    projectId: projectRef.id,
    uid,
    facts,
    replaceMaterialQuoteItems: false,
    unitPriceByTitle,
  });

  // Merge remaining priced quote/estimate lines (labor / extras not in takeoff).
  const existingQi = await projectRef.collection("quoteItems").get();
  const seededNames = new Set(
    existingQi.docs.map((d) => String(d.data()?.name ?? "").trim().toLowerCase()).filter(Boolean)
  );
  const lineBatch = db.batch();
  let quoteOrder = 1000;
  let lineWrites = 0;
  for (const line of lines.slice(0, 200)) {
    const displayName = (line.title ?? "").trim();
    if (!displayName) continue;
    const nameKey = displayName.toLowerCase();
    const isWork = line.type === "labor" || line.type === "travel";
    if (seededNames.has(nameKey) && !isWork) {
      // Upgrade price on existing material row when we have a better unit price.
      const price = line.unitPrice ?? line.unitCost ?? 0;
      if (price > 0) {
        const match = existingQi.docs.find(
          (d) => String(d.data()?.name ?? "").trim().toLowerCase() === nameKey
        );
        if (match && !(Number(match.data()?.unitPrice) > 0)) {
          lineBatch.set(
            match.ref,
            sanitizeForFirestore({ unitPrice: price, updatedAt: now }),
            { merge: true }
          );
          lineWrites++;
        }
      }
      continue;
    }
    if (seededNames.has(nameKey)) continue;
    seededNames.add(nameKey);
    lineBatch.set(
      projectRef.collection("quoteItems").doc(),
      sanitizeForFirestore({
        name: displayName,
        description: line.description ?? "",
        category: isWork ? "work" : "material",
        qty: line.quantity > 0 ? line.quantity : 1,
        unit: line.unit || "ks",
        unitPrice: line.unitPrice ?? line.unitCost ?? 0,
        order: quoteOrder++,
        createdAt: now,
        updatedAt: now,
      })
    );
    lineWrites++;
  }
  if (lineWrites > 0) await lineBatch.commit();

  let quoteId: string | undefined;
  if (input.createQuoteDocument && session.quoteDraft) {
    const quoteRef = db.collection("quotes").doc();
    const qd = session.quoteDraft;
    const write = projectWriteFields(access, uid);
    await quoteRef.set(
      sanitizeForFirestore({
        title: qd.title,
        clientName: qd.customerName || session.customerName || "Zákazník",
        projectId: projectRef.id,
        projectName: projectData.name,
        status: "draft",
        currency: qd.currency || session.countryProfile?.currency || "EUR",
        vatPercent: qd.vatPercent ?? session.countryProfile?.vatPercent ?? 20,
        notes: [
          qd.noteToCustomer,
          qd.assumptions?.length ? `Predpoklady: ${qd.assumptions.join("; ")}` : null,
          `aiEstimatorSessionId=${input.sessionId}`,
        ]
          .filter(Boolean)
          .join("\n"),
        items: (qd.lines.length ? qd.lines : lines).map((l) => ({
          title: l.title,
          description: l.description ?? "",
          quantity: l.quantity,
          unit: l.unit,
          unitPrice: l.unitPrice ?? 0,
        })),
        subtotal: qd.subtotal ?? 0,
        vatAmount: qd.vatAmount ?? 0,
        grandTotal: qd.total ?? 0,
        createdAt: now,
        updatedAt: now,
        createdBy: uid,
        ...write,
        estimatorSessionId: input.sessionId,
      })
    );
    quoteId = quoteRef.id;
    await projectRef.set(
      sanitizeForFirestore({ quoteStatus: "draft", quoteId, updatedAt: now }),
      { merge: true }
    );
  }

  await sessionRef(access.storageKey, input.sessionId).set(
    sanitizeForFirestore({
      status: "project_created",
      projectId: projectRef.id,
      quoteId: quoteId ?? null,
      updatedAt: FieldValue.serverTimestamp(),
    }),
    { merge: true }
  );

  debugLog(input.debug, "project_created", {
    sessionId: input.sessionId,
    projectId: projectRef.id,
    quoteId: quoteId ?? null,
  });

  return { projectId: projectRef.id, quoteId, sessionId: input.sessionId };
}

const syncMaterialsInputSchema = z.object({
  workspaceId: z.string(),
  companyId: optionalString,
  projectId: z.string().min(1),
  sessionId: optionalString,
  regenerateFromAttachments: z.boolean().optional(),
  debug: z.boolean().optional(),
});

/**
 * Repair / refresh project materials from estimator session (legend fold included).
 * Used when AI setup shows only sparse classic placeholder materials.
 */
export async function handleSyncEstimatorMaterialsToProject(
  uid: string | undefined,
  data: unknown
): Promise<{ projectId: string; materialCount: number; sessionId: string | null }> {
  if (!uid) throw new Error("Sign in required.");
  const input = syncMaterialsInputSchema.parse(data);
  const access = await assertWorkspaceAccess(db, uid, input.workspaceId, input.companyId);

  const projectRef = db.collection("projects").doc(input.projectId);
  const projectSnap = await projectRef.get();
  if (!projectSnap.exists) throw new Error("Project not found.");
  const project = projectSnap.data() as Record<string, unknown>;

  let sessionId =
    (typeof input.sessionId === "string" && input.sessionId.trim()) ||
    (typeof project.aiEstimatorSessionId === "string" && project.aiEstimatorSessionId.trim()) ||
    "";

  if (!sessionId) {
    const linked = await db
      .collection("workspaces")
      .doc(access.storageKey)
      .collection("aiEstimatorSessions")
      .where("projectId", "==", input.projectId)
      .limit(1)
      .get();
    if (!linked.empty) sessionId = linked.docs[0]!.id;
  }

  let facts: EstimatorFactsPayload | null = null;

  if (sessionId) {
    const snap = await sessionRef(access.storageKey, sessionId).get();
    if (snap.exists) {
      const raw = snap.data()?.facts as EstimatorFactsPayload | undefined;
      if (raw) facts = convertTechnicalDrawingFactsToEstimatorItems(raw);
    }
  }

  // Prefer folding existing session legend into takeoff — no Gemini call needed.
  const foldedCount = facts
    ? [
        ...facts.extractedItems.filter((i) => i.included !== false),
        ...facts.inferredItems.filter((i) => i.included !== false && i.origin !== "missing"),
      ].length
    : 0;

  const forceRegen = input.regenerateFromAttachments === true;
  const needsRegen = forceRegen || !facts || foldedCount < 5;

  if (needsRegen) {
    const paths = Array.isArray(project.aiWizardAttachmentPaths)
      ? (project.aiWizardAttachmentPaths as string[]).filter(Boolean)
      : [];
    const fileIds = Array.isArray(project.attachedFileIds)
      ? (project.attachedFileIds as string[]).filter(Boolean)
      : [];
    if (paths.length === 0 && fileIds.length === 0) {
      if (!facts) {
        throw new Error(
          "Žiadna AI session ani prílohy na projekte. Nahrajte podklady znova alebo vytvorte zákazku cez AI Estimator."
        );
      }
      // Keep folded session facts — do not fail when Gemini regen is unavailable.
    } else {
      try {
        const { files } = await collectDraftFilesForGeneration({
          db,
          storageKey: access.storageKey,
          authUid: uid,
          attachedFileIds: fileIds,
          documentStoragePaths: paths,
        });
        const parts: EstimatorFactsPayload[] = [];
        const regenSessionId = sessionId || db.collection("_").doc().id;
        for (const file of files) {
          if (!isVisualAttachmentMime(file.mimeType || "")) continue;
          const visual = await loadVisualAttachment(bucket, file);
          if (!visual) continue;
          try {
            const extractedText =
              typeof file.extractedText === "string" && file.extractedText.trim().length > 40
                ? file.extractedText.trim()
                : undefined;
            const extracted = await extractFactsFromAttachment({
              language: "sk",
              countryCode: "SK",
              currency: "EUR",
              tradeType: "electrical",
              attachment: {
                fileId: file.storagePath,
                fileName: visual.fileName,
                mimeType: visual.mimeType,
                bytes: visual.bytes,
                extractedText,
              },
              sessionId: regenSessionId,
              enableSymbolReading: true,
            });
            parts.push(extracted);
          } catch (err) {
            debugLog(input.debug, "sync_attachment_failed", {
              fileName: file.fileName,
              error: err instanceof Error ? err.message : String(err),
            });
          }
        }
        if (parts.length > 0) {
          const merged = mergeEstimatorFactsStrict(regenSessionId, parts);
          facts = convertTechnicalDrawingFactsToEstimatorItems(merged);
          sessionId = regenSessionId;
          await sessionRef(access.storageKey, sessionId).set(
            sanitizeForFirestore({
              facts,
              projectId: input.projectId,
              status: "synced_to_project",
              updatedAt: FieldValue.serverTimestamp(),
              createdAt: FieldValue.serverTimestamp(),
              createdBy: uid,
            }),
            { merge: true }
          );
        }
      } catch (err) {
        debugLog(input.debug, "sync_regen_skipped", {
          error: err instanceof Error ? err.message : String(err),
          hadSessionFacts: !!facts,
        });
        if (!facts) throw err;
      }
    }
  }

  if (!facts) {
    throw new Error("Nepodarilo sa načítať AI podklady pre materiály.");
  }

  const folded = convertTechnicalDrawingFactsToEstimatorItems(facts);
  const { materialCount } = await writeEstimatorMaterialsToProject({
    db,
    projectId: input.projectId,
    uid,
    facts: folded,
    replaceMaterialQuoteItems: true,
  });

  await projectRef.set(
    sanitizeForFirestore({
      aiEstimatorSessionId: sessionId || null,
      updatedAt: FieldValue.serverTimestamp(),
    }),
    { merge: true }
  );

  debugLog(input.debug, "materials_synced", {
    projectId: input.projectId,
    sessionId: sessionId || null,
    materialCount,
    legend: folded.legendEntries?.length ?? 0,
    extracted: folded.extractedItems.length,
  });

  return {
    projectId: input.projectId,
    materialCount,
    sessionId: sessionId || null,
  };
}

