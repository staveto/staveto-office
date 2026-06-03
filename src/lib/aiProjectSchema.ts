/**
 * Mobile-aligned AI project plan schema (generateProjectStructure / createProjectFromAiPlan).
 * Types only on web until callables are wired.
 */

export type AiCategory =
  | "construction"
  | "renovation"
  | "trade_installation"
  | "service"
  | "maintenance";

export type AiScope = "full_build" | "partial_build" | "single_trade" | "small_job";

export type AiUiMode = "phases" | "work_packages";

export type AiTaskType = "execution" | "coordination" | "inspection";

export type AiPriority = "low" | "medium" | "high";

export type AiTask = {
  title: string;
  description?: string;
  taskType: AiTaskType;
  priority: AiPriority;
};

export type AiPhase = {
  name: string;
  description?: string;
  tasks: AiTask[];
};

export type AiMaterialSuggestion = {
  name: string;
  category?: string;
  description?: string;
  suggestedQuantity?: number;
  unit?: string;
  estimatedUnitPrice?: number;
  estimatedTotalPrice?: number;
  currency?: string;
  confidence?: "low" | "medium" | "high";
  sourceNote?: string;
  phaseName?: string;
  taskTitle?: string;
};

export type AiProjectPlan = {
  projectTitle: string;
  category: AiCategory;
  scope: AiScope;
  summary?: string;
  uiMode?: AiUiMode;
  phases: AiPhase[];
  materialSuggestions?: AiMaterialSuggestion[];
};
