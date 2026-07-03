import type {
  AttachmentSummary,
  AttachmentProcessing,
  DraftMaterialSuggestion,
  DraftProjectFacts,
} from "./attachmentDraft";

export type DraftLanguage = "sk" | "de" | "en";

export type ProjectDraftCustomer = {
  mode: "existing" | "new" | "none";
  contactId: string | null;
  name: string | null;
  email: string | null;
  phone: string | null;
};

export type ProjectDraftTask = {
  title: string;
  description: string;
  phase: string | null;
  priority: "low" | "medium" | "high";
  estimatedDuration: string | null;
};

export type ProjectDraftMaterial = {
  name: string;
  quantity: number | null;
  unit: string | null;
  note: string | null;
};

export type ProjectDraftLineItem = {
  title: string;
  description: string;
  category: "work" | "material" | "travel" | "other";
  quantity: number | null;
  unit: string | null;
};

export type { AttachmentSummary, AttachmentProcessing, DraftMaterialSuggestion, DraftProjectFacts };

export type ProjectDraftPayload = {
  projectTitle: string;
  projectType: string;
  status: "lead" | "draft";
  summary: string;
  customer: ProjectDraftCustomer;
  location: string | null;
  tasks: ProjectDraftTask[];
  materials: ProjectDraftMaterial[];
  clarificationQuestions: string[];
  risks: string[];
  nextSteps: string[];
  offerPreparation: {
    suggestedLineItems: ProjectDraftLineItem[];
    missingPricingInputs: string[];
  };
  source: {
    creationMethod: "ai";
    attachedFileIds: string[];
    generatedAt?: string;
  };
  attachmentFindings?: AttachmentSummary[];
  projectFacts?: DraftProjectFacts;
  materialSuggestions?: DraftMaterialSuggestion[];
  missingQuestions?: string[];
  draftWarnings?: string[];
};

export type DraftChatMessage = {
  role: "user" | "assistant";
  content: string;
};
