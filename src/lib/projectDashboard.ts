import type { ProjectDoc, TaskDoc } from "./projects";
import type { QuoteDraftItemDoc } from "./quoteDraftItems";
import {
  isProjectArchived,
  normalizeLifecycleStatus,
  normalizeProjectPhase,
  isDraftJob,
  isActiveJob,
} from "./projectLifecycle";
import {
  computeAiSetupTotals,
  defaultCalculation,
  parseAiSetupMeta,
  resolveSetupMaterialRows,
  workEstimateFromQuoteItems,
} from "@/components/projects/setup/aiSetupHelpers";

export type ProjectDashboardTab =
  | "overview"
  | "tasks"
  | "workplan"
  | "quote"
  | "documents"
  | "activity";

export type HumanWorkflowStatusKey =
  | "entwurf"
  | "angebotsphase"
  | "angebotEntwurf"
  | "wartenAufKunde"
  | "angebotBestaetigt"
  | "aktiv"
  | "abgeschlossen"
  | "archiviert";

export type DashboardAction = {
  id: string;
  labelKey: string;
  href?: string;
  variant: "primary" | "secondary";
  action?: "markQuoteSent" | "convertActive" | "markAccepted";
};

export type QuoteSummary = {
  hasQuote: boolean;
  statusKey: string;
  grossTotal: number | null;
  materialTotal: number;
  workTotal: number;
  workHours: number | null;
  currency: string;
};

export type TaskProgressStats = {
  phaseCount: number;
  total: number;
  done: number;
  percent: number;
};

export function excerptText(text: string | undefined, maxLen = 180): string {
  const trimmed = text?.trim();
  if (!trimmed) return "";
  if (trimmed.length <= maxLen) return trimmed;
  return `${trimmed.slice(0, maxLen).trim()}…`;
}

export function getCustomerDisplayName(project: ProjectDoc): string {
  return (
    project.customerCompanyName?.trim() ||
    project.customerName?.trim() ||
    ""
  );
}

export function getCustomerContact(project: ProjectDoc): string {
  return (
    project.customerContactPersonName?.trim() ||
    project.customerName?.trim() ||
    ""
  );
}

export function getLocationDisplay(project: ProjectDoc): string {
  return [project.addressText, project.city].filter(Boolean).join(", ");
}

export function getHumanWorkflowStatusKey(project: ProjectDoc): HumanWorkflowStatusKey {
  if (isProjectArchived(project)) return "archiviert";

  const phase = normalizeProjectPhase(project);
  const ls = normalizeLifecycleStatus(project);
  const qs = project.quoteStatus ?? "none";
  const ss = project.salesStatus;

  if (phase === "delivery") {
    if (ls === "completed") return "abgeschlossen";
    return "aktiv";
  }

  if (ss === "accepted" || ls === "accepted") return "angebotBestaetigt";
  if (qs === "sent" || ss === "quote_sent" || ls === "quote_sent") return "wartenAufKunde";
  if (qs === "draft" || qs === "ready" || ls === "quote_drafted") return "angebotEntwurf";
  if (ls === "needs_customer_input" || ss === "waiting_for_customer") {
    return "wartenAufKunde";
  }
  if (ls === "ready_for_quote" || ls === "collecting_info" || qs === "none") {
    return "angebotsphase";
  }

  return "entwurf";
}

/** Tailwind classes for workflow status badges in project lists. */
export function getWorkflowStatusBadgeClass(
  statusKey: HumanWorkflowStatusKey
): string {
  switch (statusKey) {
    case "aktiv":
      return "border-emerald-600/35 bg-emerald-500/15 text-emerald-900 font-semibold dark:text-emerald-100";
    case "abgeschlossen":
    case "archiviert":
      return "border-border bg-muted/60 text-muted-foreground";
    case "entwurf":
    case "angebotsphase":
    case "angebotEntwurf":
    case "wartenAufKunde":
    case "angebotBestaetigt":
      return "border-[#e06737]/40 bg-[#e06737]/12 text-[#9a3d1a] font-semibold dark:text-orange-100";
    default:
      return "border-[#e06737]/30 bg-[#e06737]/10 text-[#e06737]";
  }
}

/** Subtle row background for quick scan in project tables. */
export function getProjectListRowClass(project: ProjectDoc): string {
  if (isProjectArchived(project)) return "opacity-60";
  if (isActiveJob(project)) return "bg-emerald-50/50 dark:bg-emerald-950/20";
  if (isDraftJob(project)) return "bg-orange-50/60 dark:bg-orange-950/20";
  return "";
}

export function getManagerStatusKey(project: ProjectDoc): string {
  return getHumanWorkflowStatusKey(project);
}

export function getQuoteStatusKey(project: ProjectDoc): string {
  const qs = project.quoteStatus ?? "none";
  if (qs !== "none") return qs;
  if (normalizeLifecycleStatus(project) === "quote_drafted") return "draft";
  return "none";
}

export function computeTaskProgressStats(tasks: TaskDoc[]): TaskProgressStats {
  const active = tasks.filter((t) => t.isActive !== false);
  const total = active.length;
  const done = active.filter((t) => t.status === "DONE").length;
  const phaseIds = new Set(active.map((t) => t.phaseId?.trim() || "__general__"));
  const percent = total === 0 ? 0 : Math.round((done / total) * 100);
  return { phaseCount: phaseIds.size, total, done, percent };
}

export function getNextStepKey(project: ProjectDoc): string {
  const phase = normalizeProjectPhase(project);
  const qs = project.quoteStatus ?? "none";
  const ss = project.salesStatus;
  const ls = normalizeLifecycleStatus(project);

  if (phase === "delivery") {
    if (ls === "completed") return "projects.dashboard.nextStep.reviewCompleted";
    return "projects.dashboard.nextStep.openTasks";
  }
  if (ss === "accepted" || ls === "accepted") {
    return "projects.dashboard.nextStep.convertActive";
  }
  if (qs === "sent" || ss === "quote_sent") {
    return "projects.dashboard.nextStep.waitingCustomer";
  }
  if (qs === "draft" || qs === "ready") return "projects.dashboard.nextStep.openQuote";
  if (ls === "needs_customer_input" || ss === "waiting_for_customer") {
    return "projects.dashboard.nextStep.waitingCustomer";
  }
  if (qs === "none") return "projects.dashboard.nextStep.prepareQuote";
  return "projects.dashboard.nextStep.reviewProject";
}

/**
 * True when the job is still in the sales phase with an unsent quote draft.
 * In this state the delivery phase map (Diagnose → …) must NOT look like the
 * primary next action — the quote must be sent first.
 */
export function isBlockedByUnsentQuote(project: ProjectDoc): boolean {
  const phase = normalizeProjectPhase(project);
  const qs = project.quoteStatus ?? "none";
  return phase !== "delivery" && (qs === "draft" || qs === "ready");
}

export type NextActionTone = "neutral" | "attention" | "positive";

export type NextActionContent = {
  /** Short status line (attention-colored), describes current state in words. */
  statusKey: string;
  /** Optional small status badge label; null when no badge. */
  badgeKey: string | null;
  badgeTone: NextActionTone;
  /** Optional explicit block reason line. */
  blockReasonKey: string | null;
  /** Concrete operational description of what to do next. */
  descriptionKey: string;
};

/**
 * Resolves the human-readable status / block reason / description for the
 * "Next step" card. Mirrors the same state machine as {@link getDashboardActions}
 * so the copy always matches the offered actions (e.g. quote draft → quote actions).
 */
export function getNextActionContent(project: ProjectDoc): NextActionContent {
  const phase = normalizeProjectPhase(project);
  const qs = project.quoteStatus ?? "none";
  const ss = project.salesStatus;
  const ls = normalizeLifecycleStatus(project);

  if (phase === "delivery") {
    if (ls === "completed") {
      return {
        statusKey: "projects.dashboard.next.status.completed",
        badgeKey: null,
        badgeTone: "positive",
        blockReasonKey: null,
        descriptionKey: "projects.dashboard.next.desc.completed",
      };
    }
    return {
      statusKey: "projects.dashboard.next.status.delivery",
      badgeKey: "projects.dashboard.next.badge.active",
      badgeTone: "positive",
      blockReasonKey: null,
      descriptionKey: "projects.dashboard.next.desc.delivery",
    };
  }

  if (ss === "accepted" || ls === "accepted") {
    return {
      statusKey: "projects.dashboard.next.status.accepted",
      badgeKey: "projects.dashboard.next.badge.ready",
      badgeTone: "positive",
      blockReasonKey: null,
      descriptionKey: "projects.dashboard.next.desc.accepted",
    };
  }

  if (qs === "sent" || ss === "quote_sent") {
    return {
      statusKey: "projects.dashboard.next.status.quoteSent",
      badgeKey: "projects.dashboard.next.badge.waiting",
      badgeTone: "attention",
      blockReasonKey: null,
      descriptionKey: "projects.dashboard.next.desc.quoteSent",
    };
  }

  if (qs === "draft" || qs === "ready") {
    return {
      statusKey: "projects.dashboard.next.status.quoteDraft",
      badgeKey: "projects.dashboard.next.badge.blocked",
      badgeTone: "attention",
      blockReasonKey: "projects.dashboard.next.block.quoteNotSent",
      descriptionKey: "projects.dashboard.next.desc.quoteDraft",
    };
  }

  if (ls === "needs_customer_input" || ss === "waiting_for_customer") {
    return {
      statusKey: "projects.dashboard.next.status.waiting",
      badgeKey: "projects.dashboard.next.badge.waiting",
      badgeTone: "attention",
      blockReasonKey: null,
      descriptionKey: "projects.dashboard.next.desc.waiting",
    };
  }

  return {
    statusKey: "projects.dashboard.next.status.noQuote",
    badgeKey: "projects.dashboard.next.badge.salesPhase",
    badgeTone: "neutral",
    blockReasonKey: null,
    descriptionKey: "projects.dashboard.next.desc.noQuote",
  };
}

export function getPrimaryActionSubtextKey(project: ProjectDoc): string | null {
  const phase = normalizeProjectPhase(project);
  const qs = project.quoteStatus ?? "none";
  const ss = project.salesStatus;
  const ls = normalizeLifecycleStatus(project);

  if (phase === "delivery") return "projects.dashboard.subtext.openTasks";
  if (ss === "accepted" || ls === "accepted") {
    return "projects.dashboard.subtext.convertActive";
  }
  if (qs === "sent" || ss === "quote_sent") {
    return "projects.dashboard.subtext.waitingCustomer";
  }
  if (qs === "draft" || qs === "ready") return "projects.dashboard.subtext.openQuote";
  if (phase === "sales" && qs === "none") {
    return "projects.dashboard.subtext.prepareQuote";
  }
  return null;
}

export function getDashboardActions(project: ProjectDoc): DashboardAction[] {
  const phase = normalizeProjectPhase(project);
  const qs = project.quoteStatus ?? "none";
  const ss = project.salesStatus;
  const ls = normalizeLifecycleStatus(project);
  const id = project.id;

  if (phase === "delivery") {
    return [
      {
        id: "open-tasks",
        labelKey: "projects.dashboard.action.openTasks",
        href: `/app/projects/${id}?tab=tasks`,
        variant: "primary",
      },
      {
        id: "team",
        labelKey: "projects.dashboard.action.planTeam",
        href: `/app/projects/${id}?tab=overview`,
        variant: "secondary",
      },
    ];
  }

  if (ss === "accepted" || ls === "accepted") {
    return [
      {
        id: "convert",
        labelKey: "projects.draft.convert",
        variant: "primary",
        action: "convertActive",
      },
    ];
  }

  if (qs === "sent" || ss === "quote_sent") {
    return [
      {
        id: "waiting",
        labelKey: "projects.dashboard.action.waitingCustomer",
        href: `/app/projects/${id}?tab=overview`,
        variant: "primary",
      },
      {
        id: "mark-accepted",
        labelKey: "projects.draft.markAccepted",
        variant: "secondary",
        action: "markAccepted",
      },
    ];
  }

  if (qs === "draft" || qs === "ready") {
    return [
      {
        id: "open-quote",
        labelKey: "projects.dashboard.action.openQuote",
        href: `/app/projects/${id}?setup=ai`,
        variant: "primary",
      },
      {
        id: "mark-sent",
        labelKey: "projects.dashboard.action.markQuoteSent",
        variant: "secondary",
        action: "markQuoteSent",
      },
    ];
  }

  return [
    {
      id: "prepare-quote",
      labelKey: "projects.dashboard.action.prepareQuote",
      href: `/app/projects/${id}?setup=ai`,
      variant: "primary",
    },
    {
      id: "add-material",
      labelKey: "projects.dashboard.action.addMaterial",
      href: `/app/projects/${id}?setup=ai`,
      variant: "secondary",
    },
  ];
}

export function computeQuoteSummary(
  project: ProjectDoc,
  quoteItems: QuoteDraftItemDoc[],
  tasks: TaskDoc[]
): QuoteSummary {
  const qs = project.quoteStatus ?? "none";
  const meta = parseAiSetupMeta(project.quoteDraftNotes);
  const calc = meta?.calculation ?? defaultCalculation(project.quoteDraftVatPercent);
  const materials = resolveSetupMaterialRows(quoteItems, [], []);
  const work = meta?.workEstimate ?? workEstimateFromQuoteItems(quoteItems, tasks);
  const totals = computeAiSetupTotals(materials, work, calc);

  const hasItems = quoteItems.length > 0;
  const hasQuote = qs !== "none" || hasItems;

  let statusKey = "none";
  if (qs !== "none") statusKey = qs;
  else if (hasItems) statusKey = "draft";

  return {
    hasQuote,
    statusKey,
    grossTotal: hasQuote ? totals.grossTotal : null,
    materialTotal: totals.materialCost,
    workTotal: totals.workCost,
    workHours: work.hours > 0 ? work.hours : null,
    currency: "CHF",
  };
}

export function formatMoney(amount: number | null, currency = "CHF"): string {
  if (amount == null || Number.isNaN(amount)) return "";
  return new Intl.NumberFormat("de-CH", {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
  }).format(amount);
}

export type TaskPhaseGroup = {
  id: string;
  label: string;
  tasks: TaskDoc[];
};

export function groupTasksByPhase(tasks: TaskDoc[]): TaskPhaseGroup[] {
  const map = new globalThis.Map<string, TaskDoc[]>();
  for (const task of tasks) {
    const key = task.phaseId?.trim() || "__general__";
    const list = map.get(key) ?? [];
    list.push(task);
    map.set(key, list);
  }

  let phaseNum = 0;
  return Array.from(map.entries()).map(([id, phaseTasks]) => {
    if (id !== "__general__") phaseNum += 1;
    return {
      id,
      label: id === "__general__" ? "general" : id || `phase-${phaseNum}`,
      tasks: phaseTasks.sort((a, b) => (a.order ?? 0) - (b.order ?? 0)),
    };
  });
}

export function getProjectSummaryText(project: ProjectDoc): string {
  return (
    project.customerRequest?.trim() ||
    project.internalNote?.trim() ||
    ""
  );
}

/** Dashboard / KPI link target for project quote (tab or AI setup). */
export function getProjectQuoteHref(project: ProjectDoc): string {
  const id = project.id;
  const phase = normalizeProjectPhase(project);
  const qs = project.quoteStatus ?? "none";

  if (phase === "sales" && qs === "none") {
    return `/app/projects/${id}?setup=ai`;
  }

  return `/app/projects/${id}?tab=quote`;
}

export function getListPrimaryAction(project: ProjectDoc): {
  labelKey: string;
  href: string;
} {
  const phase = normalizeProjectPhase(project);
  const qs = project.quoteStatus ?? "none";
  const ss = project.salesStatus;
  const id = project.id;

  if (phase === "delivery") {
    return {
      labelKey: "projects.dashboard.action.openTasks",
      href: `/app/projects/${id}?tab=tasks`,
    };
  }

  if (phase === "sales" && qs === "none") {
    return {
      labelKey: "projects.dashboard.action.prepareQuote",
      href: `/app/projects/${id}?setup=ai`,
    };
  }

  if (phase === "sales" && (qs === "draft" || qs === "ready")) {
    return {
      labelKey: "projects.dashboard.action.openQuote",
      href: `/app/projects/${id}?setup=ai`,
    };
  }

  return {
    labelKey: "projects.dashboard.action.openJob",
    href: `/app/projects/${id}`,
  };
}

export function isAiSourcedProject(project: ProjectDoc): boolean {
  const src = (project.source ?? "").toLowerCase();
  return src === "ai" || src.includes("ai");
}

export function getSourceDisplayKey(project: ProjectDoc): "ai" | "manual" {
  return isAiSourcedProject(project) ? "ai" : "manual";
}
