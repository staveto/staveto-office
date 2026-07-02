export type AgentInsightSeverity = "info" | "warning" | "critical" | "opportunity";

export type AgentSuggestedActionType =
  | "navigate"
  | "highlight_field"
  | "copy_text"
  | "open_ai_assistant"
  | "open_ai_brief";

export type AgentRiskLevel = "low" | "medium" | "high";

export type AgentSuggestedAction = {
  type: AgentSuggestedActionType;
  label: string;
  description: string;
  targetRoute?: string;
  proposedPatch?: Record<string, string>;
  confirmationText?: string;
  riskLevel: AgentRiskLevel;
};

export type AgentInsight = {
  id: string;
  severity: AgentInsightSeverity;
  title: string;
  message: string;
  reason: string;
  source: "local" | "gemini";
  confidence: "high" | "medium" | "low";
  suggestedAction?: AgentSuggestedAction;
  requiresConfirmation: boolean;
  relatedEntityType?: string;
  relatedEntityId?: string;
};

export type AgentInsightMode = "analyze_screen" | "next_best_action" | "explain_risk";

export type AskManagerAgentInput = {
  screenContext: import("./managerScreenContext").ManagerScreenContext;
  question?: string;
  mode: AgentInsightMode;
};

export type AskManagerAgentResult = {
  insights: AgentInsight[];
  summary: string;
  aiEnabled: boolean;
};
