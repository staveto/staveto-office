import { describe, expect, it } from "vitest";
import { formatAttachmentFindingsForPrompt } from "../../../functions/src/attachmentPrompt";
import {
  deriveExtractedSignals,
  emptyAttachmentSummary,
  parseAttachmentSummaryJson,
} from "../../../functions/src/attachmentSummarySchema";
import {
  enrichDraftWithAttachmentFindings,
  finalizeAttachmentProcessing,
} from "../../../functions/src/draftAttachmentMerge";
import {
  isAllowedDraftStoragePath,
  loadDraftFilesFromStoragePaths,
} from "../../../functions/src/files";
import { buildGeneratePrompt } from "../../../functions/src/draftPrompt";
import { parseProjectDraftJson, parseProjectDraftPayload } from "../../../functions/src/draftSchema";
import { officeDraftToAiProjectPlan } from "@/lib/officeDraftToAiPlan";
import { rebalanceAiPhasesForReview } from "@/lib/aiProjectSchema";
import {
  formatAttachmentProcessingSummary,
  resolveMaterialSourceKind,
} from "@/types/attachmentDraft";
import type { ProjectDraftPayload } from "@/types/aiProjectDraft";

const baseDraft: ProjectDraftPayload = {
  projectTitle: "Test",
  projectType: "customer_job",
  status: "draft",
  summary: "Summary",
  customer: {
    mode: "none",
    contactId: null,
    name: null,
    email: null,
    phone: null,
  },
  location: null,
  tasks: [],
  materials: [],
  clarificationQuestions: [],
  risks: [],
  nextSteps: [],
  offerPreparation: { suggestedLineItems: [], missingPricingInputs: [] },
  source: { creationMethod: "ai", attachedFileIds: [] },
};

describe("attachment file security", () => {
  it("rejects unscoped storage path", () => {
    const diagnostics: Parameters<typeof loadDraftFilesFromStoragePaths>[3] = [];
    const files = loadDraftFilesFromStoragePaths(
      "user-1",
      "ws-1",
      ["workspaces/other-org/ai-drafts/sess/file.pdf"],
      diagnostics
    );
    expect(files).toHaveLength(0);
    expect(diagnostics[0]?.status).toBe("skipped");
  });

  it("allows workspace-scoped path", () => {
    expect(
      isAllowedDraftStoragePath("workspaces/ws-1/ai-drafts/sess/plan.pdf", "user-1", "ws-1")
    ).toBe(true);
  });
});

describe("attachment prompt injection", () => {
  it("injects attachment findings into final draft prompt", () => {
    const summary = emptyAttachmentSummary("plan.pdf", "Floor plan with rooms");
    summary.documentType = "floor_plan";
    summary.roomsAndAreas = [{ roomName: "Kitchen", areaM2: 12, sourceNote: "Room table p.1" }];
    const prompt = buildGeneratePrompt({
      language: "en",
      jobType: "customer_job",
      contactMode: "none",
      description: "Renovation",
      attachmentFindingsText: formatAttachmentFindingsForPrompt([summary]),
    });
    expect(prompt).toContain("ATTACHMENT FINDINGS");
    expect(prompt).toContain("Kitchen");
    expect(prompt).toContain("Use ATTACHMENT FINDINGS as primary project context");
  });
});

describe("structured attachment summary", () => {
  it("extracts rooms and areas from JSON", () => {
    const parsed = parseAttachmentSummaryJson(
      JSON.stringify({
        fileName: "plan.pdf",
        documentType: "floor_plan",
        extractedTextSummary: "Floor plan",
        roomsAndAreas: [{ roomName: "Bedroom", areaM2: 14, sourceNote: "table" }],
        dimensions: [],
        detectedScopeOfWork: ["Interior fit-out"],
        detectedMaterials: [],
        timeOrDurationHints: [],
        risksOrConstraints: [],
        missingQuestions: ["Which floor finish?"],
        confidence: "medium",
      }),
      "plan.pdf"
    );
    expect(parsed.roomsAndAreas[0]?.roomName).toBe("Bedroom");
    expect(deriveExtractedSignals(parsed).hasRoomSchedule).toBe(true);
  });

  it("does not require quantities for floor plan materials", () => {
    const parsed = parseAttachmentSummaryJson(
      JSON.stringify({
        fileName: "plan.pdf",
        documentType: "floor_plan",
        extractedTextSummary: "No material list",
        roomsAndAreas: [],
        dimensions: [],
        detectedScopeOfWork: [],
        detectedMaterials: [
          {
            name: "Insulation",
            category: "insulation",
            confidence: "low",
            sourceNote: "Inferred from floor plan",
          },
        ],
        timeOrDurationHints: [],
        risksOrConstraints: [],
        missingQuestions: ["Confirm insulation type"],
        confidence: "low",
      }),
      "plan.pdf"
    );
    expect(parsed.detectedMaterials[0]?.quantity).toBeUndefined();
  });
});

describe("draft enrichment", () => {
  it("adds material suggestions with attachment source", () => {
    const summary = emptyAttachmentSummary("spec.pdf", "Spec");
    summary.detectedMaterials = [
      {
        name: "Tiles",
        category: "flooring",
        confidence: "high",
        sourceNote: "Material schedule",
      },
    ];
    const enriched = enrichDraftWithAttachmentFindings(baseDraft, [summary]);
    expect(enriched.materialSuggestions?.[0]?.source).toBe("attachment");
    expect(enriched.materialSuggestions?.[0]?.confidence).toBe("high");
  });

  it("reports zero processed files when none uploaded", () => {
    const result = finalizeAttachmentProcessing(
      {
        uploadedFileCount: 0,
        processedFileCount: 0,
        skippedFileCount: 0,
        processedFiles: [],
        warnings: [],
      },
      []
    );
    expect(result.processedFileCount).toBe(0);
  });
});

describe("office draft review mapping", () => {
  it("maps material source labels for review UI", () => {
    const plan = officeDraftToAiProjectPlan(
      {
        ...baseDraft,
        materialSuggestions: [
          {
            name: "Blocks",
            category: "masonry",
            confidence: "low",
            source: "inferred",
            sourceNote: "Inferred from floor plan",
          },
        ],
      },
      "customer_job"
    );
    expect(plan.materialSuggestions?.[0]?.materialSource).toBe("inferred");
    expect(resolveMaterialSourceKind(plan.materialSuggestions![0]!)).toBe("inferred");
  });

  it("shows attachment processing summary card text", () => {
    const text = formatAttachmentProcessingSummary(
      {
        uploadedFileCount: 1,
        processedFileCount: 1,
        skippedFileCount: 0,
        processedFiles: [
          {
            name: "plan.pdf",
            status: "processed",
            extractedSignals: {
              hasFloorPlan: true,
              hasRoomSchedule: true,
              hasDimensions: true,
            },
          },
        ],
        warnings: [],
      },
      "sk"
    );
    expect(text?.headline).toContain("analyzovala 1 dokument");
    expect(text?.found).toContain("pôdorys");
  });
});

describe("createProjectFromDraft compatibility", () => {
  it("accepts legacy draft without optional attachment fields", () => {
    expect(baseDraft.attachmentFindings).toBeUndefined();
    expect(baseDraft.materialSuggestions).toBeUndefined();
  });
});

describe("gemini draft validation", () => {
  it("accepts null material suggestion quantities and drops echoed attachmentFindings", () => {
    const draft = parseProjectDraftJson(
      JSON.stringify({
        ...baseDraft,
        attachmentFindings: [{ documentType: "floor_plan" }],
        materialSuggestions: Array.from({ length: 3 }, (_, i) => ({
          name: `Material ${i}`,
          category: "general",
          quantity: null,
          confidence: "low",
          source: "inferred",
        })),
      })
    );
    expect(draft.attachmentFindings).toBeUndefined();
    expect(draft.materialSuggestions?.every((m) => m.quantity === undefined)).toBe(true);
  });

  it("coerces Slovak comma decimals in attachment summary JSON", () => {
    const summary = parseAttachmentSummaryJson(
      JSON.stringify({
        fileName: "pudorys.pdf",
        documentType: "floor_plan",
        extractedTextSummary: "Pôdorys bungalovu",
        roomsAndAreas: [
          {
            roomName: "Obývacia izba",
            areaM2: "24,3",
            sourceNote: "tabuľka miestností: 24,3 m²",
          },
          {
            roomName: "Kuchyňa",
            areaM2: "12,50",
            sourceNote: "12,50 m²",
          },
        ],
        dimensions: [{ label: "Zastavaná plocha", value: "1.234,56 m²", sourceNote: "titulná strana" }],
        detectedScopeOfWork: [],
        detectedMaterials: [{ name: "Tehla", quantity: "1.250,5", unit: "ks", confidence: "high", sourceNote: "výkaz" }],
        timeOrDurationHints: [],
        risksOrConstraints: [],
        missingQuestions: [],
        confidence: "high",
      }),
      "pudorys.pdf"
    );
    expect(summary.roomsAndAreas[0]?.areaM2).toBe(24.3);
    expect(summary.roomsAndAreas[1]?.areaM2).toBe(12.5);
    expect(summary.detectedMaterials[0]?.quantity).toBe(1250.5);
  });

  it("coerces comma quantities in project draft JSON", () => {
    const draft = parseProjectDraftPayload({
      ...baseDraft,
      projectFacts: {
        totalKnownAreaM2: "86,5",
        rooms: [{ name: "Spálňa", areaM2: "14,25" }],
      },
      materialSuggestions: [
        {
          name: "Podlahové krytiny",
          category: "floor",
          quantity: "86,5",
          unit: "m2",
          confidence: "medium",
          source: "attachment",
        },
      ],
    });
    expect(draft.projectFacts?.totalKnownAreaM2).toBe(86.5);
    expect(draft.projectFacts?.rooms?.[0]?.areaM2).toBe(14.25);
    expect(draft.materialSuggestions?.[0]?.quantity).toBe(86.5);
  });

  it("coerces null task descriptions before validation", () => {
    const draft = parseProjectDraftPayload({
      ...baseDraft,
      tasks: [
        {
          title: "Demo task",
          description: null,
          phase: null,
          priority: "medium",
          estimatedDuration: null,
        },
      ],
    });
    expect(draft.tasks[0]?.description).toBe("");
  });
});

describe("office plan review limits", () => {
  it("rebalances more than 10 tasks in one phase", () => {
    const plan = officeDraftToAiProjectPlan(
      {
        ...baseDraft,
        tasks: Array.from({ length: 15 }, (_, i) => ({
          title: `Task ${i + 1}`,
          description: "",
          phase: "Hlavná fáza",
          priority: "medium",
          estimatedDuration: null,
        })),
      },
      "large_construction_project"
    );
    const rebalanced = rebalanceAiPhasesForReview(plan.phases);
    expect(rebalanced.length).toBeGreaterThan(1);
    expect(rebalanced.every((phase) => phase.tasks.length <= 10)).toBe(true);
  });
});
