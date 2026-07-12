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
  materialSource?: "attachment" | "inferred" | "needs_confirmation";
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

const AI_CATEGORIES: AiCategory[] = [
  "construction",
  "renovation",
  "trade_installation",
  "service",
  "maintenance",
];

const AI_SCOPES: AiScope[] = ["full_build", "partial_build", "single_trade", "small_job"];

const AI_TASK_TYPES: AiTaskType[] = ["execution", "coordination", "inspection"];

const AI_PRIORITIES: AiPriority[] = ["low", "medium", "high"];

function isString(s: unknown): s is string {
  return typeof s === "string" && s.trim().length > 0;
}

function isValidEnum<T extends string>(value: unknown, allowed: readonly T[]): value is T {
  return typeof value === "string" && (allowed as readonly string[]).includes(value);
}

export type ValidationError = {
  path: string;
  message: string;
};

/** Normalizes common Gemini output quirks before validation (mobile parity). */
export function sanitizeAiProjectPlanFromModel(data: unknown): unknown {
  if (data === null || data === undefined) return data;
  if (Array.isArray(data)) {
    if (data.length === 1 && data[0] && typeof data[0] === "object" && !Array.isArray(data[0])) {
      return sanitizeAiProjectPlanFromModel(data[0]);
    }
    return data;
  }
  if (typeof data !== "object") return data;
  let obj: Record<string, unknown>;
  try {
    obj = JSON.parse(JSON.stringify(data)) as Record<string, unknown>;
  } catch {
    return data;
  }

  const canon = (s: string): string => s.trim().toLowerCase().replace(/[\s-]+/g, "_");

  if (typeof obj.category === "string") {
    const c = canon(obj.category);
    if ((AI_CATEGORIES as readonly string[]).includes(c)) obj.category = c;
  }

  if (typeof obj.scope === "string") {
    const sc = canon(obj.scope);
    if ((AI_SCOPES as readonly string[]).includes(sc)) obj.scope = sc;
  }

  if (typeof obj.uiMode === "string") {
    const u = canon(obj.uiMode);
    if (u === "work_packages" || u === "workpackages") obj.uiMode = "work_packages";
    else if (u === "phases") obj.uiMode = "phases";
  }

  if (Array.isArray(obj.phases)) {
    for (const phase of obj.phases) {
      if (!phase || typeof phase !== "object" || Array.isArray(phase)) continue;
      const p = phase as Record<string, unknown>;
      if (!Array.isArray(p.tasks)) continue;
      for (const task of p.tasks) {
        if (!task || typeof task !== "object" || Array.isArray(task)) continue;
        const t = task as Record<string, unknown>;
        if (typeof t.taskType === "string") {
          const tt = canon(String(t.taskType));
          if ((AI_TASK_TYPES as readonly string[]).includes(tt)) t.taskType = tt;
        } else if (t.taskType === undefined || t.taskType === null || t.taskType === "") {
          t.taskType = "execution";
        }
        if (typeof t.priority === "string") {
          const pr = canon(String(t.priority));
          if ((AI_PRIORITIES as readonly string[]).includes(pr)) t.priority = pr;
        } else if (t.priority === undefined || t.priority === null || t.priority === "") {
          t.priority = "medium";
        }
      }
    }
  }

  return obj;
}

const MAX_AI_PHASES = 12;
const MAX_AI_TASKS_PER_PHASE = 12;

/** Keep office draft review within mobile-aligned phase/task limits. */
export function rebalanceAiPhasesForReview(phases: AiPhase[]): AiPhase[] {
  if (phases.length === 0) return phases;

  const needsRebalance =
    phases.length > MAX_AI_PHASES ||
    phases.some((phase) => phase.tasks.length > MAX_AI_TASKS_PER_PHASE);

  if (!needsRebalance) return phases;

  const allTasks = phases.flatMap((phase) => phase.tasks);
  if (allTasks.length === 0) return phases;

  const chunks: AiTask[][] = [];
  for (let i = 0; i < allTasks.length; i += MAX_AI_TASKS_PER_PHASE) {
    chunks.push(allTasks.slice(i, i + MAX_AI_TASKS_PER_PHASE));
    if (chunks.length >= MAX_AI_PHASES) {
      break;
    }
  }

  const overflowStart = MAX_AI_PHASES * MAX_AI_TASKS_PER_PHASE;
  if (allTasks.length > overflowStart && chunks.length > 0) {
    const last = chunks[chunks.length - 1];
    chunks[chunks.length - 1] = [...last, ...allTasks.slice(overflowStart)].slice(
      0,
      MAX_AI_TASKS_PER_PHASE
    );
  }

  const baseName = phases[0]?.name?.trim() || "Main phase";
  return chunks.map((tasks, index) => ({
    name: index === 0 ? baseName : `${baseName} ${index + 1}`,
    description: index === 0 ? phases[0]?.description : undefined,
    tasks,
  }));
}

/** Validates AI response against schema. Returns errors or null if valid. */
export function validateAiProjectPlan(data: unknown): ValidationError[] | null {
  const errors: ValidationError[] = [];
  const normalized = sanitizeAiProjectPlanFromModel(data);

  if (!normalized || typeof normalized !== "object" || Array.isArray(normalized)) {
    return [{ path: "root", message: "Expected object" }];
  }

  const obj = normalized as Record<string, unknown>;

  if (!isString(obj.projectTitle)) {
    errors.push({
      path: "projectTitle",
      message: "projectTitle is required and must be non-empty string",
    });
  }

  if (!isValidEnum(obj.category, AI_CATEGORIES)) {
    errors.push({
      path: "category",
      message: `category must be one of: ${AI_CATEGORIES.join(", ")}`,
    });
  }

  if (!isValidEnum(obj.scope, AI_SCOPES)) {
    errors.push({
      path: "scope",
      message: `scope must be one of: ${AI_SCOPES.join(", ")}`,
    });
  }

  if (obj.uiMode !== undefined && obj.uiMode !== null) {
    const validUiModes = ["phases", "work_packages"];
    if (typeof obj.uiMode !== "string" || !validUiModes.includes(obj.uiMode)) {
      errors.push({
        path: "uiMode",
        message: `uiMode must be one of: ${validUiModes.join(", ")}`,
      });
    }
  }

  if (!Array.isArray(obj.phases)) {
    errors.push({ path: "phases", message: "phases is required and must be array" });
  } else {
    if (obj.phases.length < 1) {
      errors.push({ path: "phases", message: "At least 1 phase required" });
    }
    if (obj.phases.length > 8) {
      errors.push({ path: "phases", message: "Maximum 8 phases allowed" });
    }

    obj.phases.forEach((phase, pi) => {
      const prefix = `phases[${pi}]`;
      if (!phase || typeof phase !== "object") {
        errors.push({ path: prefix, message: "Phase must be object" });
        return;
      }
      const p = phase as Record<string, unknown>;
      if (!isString(p.name)) {
        errors.push({ path: `${prefix}.name`, message: "Phase name is required" });
      }
      if (!Array.isArray(p.tasks)) {
        errors.push({ path: `${prefix}.tasks`, message: "Phase tasks must be array" });
      } else {
        if (p.tasks.length < 1) {
          errors.push({
            path: `${prefix}.tasks`,
            message: "Each phase must have at least 1 task",
          });
        }
        if (p.tasks.length > 10) {
          errors.push({
            path: `${prefix}.tasks`,
            message: "Maximum 10 tasks per phase",
          });
        }
        (p.tasks as unknown[]).forEach((task, ti) => {
          const tPrefix = `${prefix}.tasks[${ti}]`;
          if (!task || typeof task !== "object") {
            errors.push({ path: tPrefix, message: "Task must be object" });
            return;
          }
          const t = task as Record<string, unknown>;
          if (!isString(t.title)) {
            errors.push({
              path: `${tPrefix}.title`,
              message: "Task title is required",
            });
          }
          if (t.taskType !== undefined && !isValidEnum(t.taskType, AI_TASK_TYPES)) {
            errors.push({
              path: `${tPrefix}.taskType`,
              message: `taskType must be one of: ${AI_TASK_TYPES.join(", ")}`,
            });
          }
          if (t.priority !== undefined && !isValidEnum(t.priority, AI_PRIORITIES)) {
            errors.push({
              path: `${tPrefix}.priority`,
              message: `priority must be one of: ${AI_PRIORITIES.join(", ")}`,
            });
          }
        });
      }
    });
  }

  return errors.length > 0 ? errors : null;
}
