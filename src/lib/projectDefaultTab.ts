/**
 * Phase 1D — quote-first landing and tab resolution for project detail.
 */

import type { ProjectDoc } from "@/lib/projects";
import {
  normalizeLifecycleStatus,
  normalizeProjectPhase,
  type ProjectLifecycleStatus,
  type ProjectPhase,
  type ProjectPhaseInput,
  type ProjectQuoteStatus,
} from "@/lib/projectLifecycle";
import {
  type ProjectDashboardTab,
  isProjectDashboardTabVisible,
} from "@/lib/projectDashboard";
import type { EnabledModulesMap } from "@/lib/enabledModules";
import { isManualQuoteWorkspaceEnabled } from "@/lib/projectCreationFeature";

const VALID_TABS: ReadonlySet<string> = new Set([
  "overview",
  "tasks",
  "workplan",
  "quote",
  "documents",
  "activity",
  "problems",
]);

export type ResolveProjectDefaultTabInput = {
  requestedTab: string | null | undefined;
  projectPhase: ProjectPhase | string | undefined;
  lifecycleStatus: ProjectLifecycleStatus | string | undefined;
  quoteStatus: ProjectQuoteStatus | string | undefined;
  manualQuoteWorkspaceEnabled?: boolean;
  modules?: EnabledModulesMap | null;
};

type QuotePrepPhaseInput = {
  /** ProjectDoc.phase */
  phase?: ProjectPhase | string | undefined;
  /** Alias used by resolveProjectDefaultTab */
  projectPhase?: ProjectPhase | string | undefined;
  lifecycleStatus?: ProjectLifecycleStatus | string | undefined;
  quoteStatus?: ProjectQuoteStatus | string | undefined;
};

function asPhaseInput(input: QuotePrepPhaseInput): ProjectPhaseInput {
  return {
    phase: (input.projectPhase ?? input.phase) as ProjectPhase | undefined,
    lifecycleStatus: input.lifecycleStatus as ProjectLifecycleStatus | undefined,
    quoteStatus: input.quoteStatus as ProjectQuoteStatus | undefined,
  };
}

/** Sales / quote-prep phase where quote should be the default landing. */
export function isQuotePreparationPhase(input: QuotePrepPhaseInput): boolean {
  const proj = asPhaseInput(input);
  const phase = normalizeProjectPhase(proj);
  if (phase !== "sales") return false;

  const ls = normalizeLifecycleStatus(proj);
  const qs = (input.quoteStatus ?? "none") as string;

  // Accepted / waiting-on-customer: keep overview as smarter home.
  if (ls === "accepted" || ls === "converted_to_project") return false;
  if (qs === "accepted" || qs === "sent") return false;

  return (
    qs === "none" ||
    qs === "draft" ||
    qs === "ready" ||
    ls === "new_request" ||
    ls === "collecting_info" ||
    ls === "ready_for_quote" ||
    ls === "quote_drafted" ||
    ls === "needs_customer_input"
  );
}

export function parseProjectDashboardTab(
  raw: string | null | undefined
): ProjectDashboardTab | null {
  if (!raw) return null;
  if (raw === "materials" || raw === "expenses") return "quote";
  if (VALID_TABS.has(raw)) return raw as ProjectDashboardTab;
  return null;
}

/**
 * Resolve which project detail tab to show.
 * Explicit valid URL tab always wins (no rewrite of ?tab=overview → quote).
 */
export function resolveProjectDefaultTab(
  input: ResolveProjectDefaultTabInput
): ProjectDashboardTab {
  const manual =
    input.manualQuoteWorkspaceEnabled ?? isManualQuoteWorkspaceEnabled();
  const explicit = parseProjectDashboardTab(input.requestedTab);

  if (explicit) {
    // Quote tab stays available in quote-prep even if org module "quotes" is off.
    if (explicit === "quote" && manual) return "quote";
    if (isProjectDashboardTabVisible(explicit, input.modules)) return explicit;
    // Invalid / module-hidden explicit tab → fall through to smart default
  }

  if (manual && isQuotePreparationPhase(input)) {
    return "quote";
  }

  return "overview";
}

export function resolveProjectDefaultTabForProject(
  project: Pick<ProjectDoc, "phase" | "lifecycleStatus" | "quoteStatus">,
  requestedTab: string | null | undefined,
  modules?: EnabledModulesMap | null
): ProjectDashboardTab {
  return resolveProjectDefaultTab({
    requestedTab,
    projectPhase: project.phase,
    lifecycleStatus: project.lifecycleStatus,
    quoteStatus: project.quoteStatus,
    modules,
  });
}

export type ProjectHeaderPrimaryAction = {
  tab: ProjectDashboardTab;
  /** i18n key for the primary CTA label */
  labelKey: string;
};

/**
 * Primary header CTA: quote-first in prep; work plan / urgent tasks in delivery.
 */
export function resolveProjectHeaderPrimaryAction(input: {
  project: Pick<ProjectDoc, "phase" | "lifecycleStatus" | "quoteStatus">;
  activeTab?: ProjectDashboardTab;
  hasUrgent?: boolean;
  manualQuoteWorkspaceEnabled?: boolean;
}): ProjectHeaderPrimaryAction {
  const manual =
    input.manualQuoteWorkspaceEnabled ?? isManualQuoteWorkspaceEnabled();
  if (manual && isQuotePreparationPhase(input.project)) {
    return {
      tab: "quote",
      labelKey:
        input.activeTab === "quote"
          ? "projects.cockpit.cta.previewQuote"
          : "projects.cockpit.cta.continueQuote",
    };
  }
  if (input.hasUrgent) {
    return {
      tab: "tasks",
      labelKey: "projects.cockpit.cta.solveProblem",
    };
  }
  return {
    tab: "workplan",
    labelKey: "projects.cockpit.cta.openPlan",
  };
}

/** Tab strip order: quote-first in prep, overview-first in delivery. */
export function getOrderedProjectDashboardTabs(
  project: Pick<ProjectDoc, "phase" | "lifecycleStatus" | "quoteStatus">,
  modules?: EnabledModulesMap | null
): ProjectDashboardTab[] {
  const quotePrep =
    isManualQuoteWorkspaceEnabled() && isQuotePreparationPhase(project);

  const salesOrder: ProjectDashboardTab[] = [
    "quote",
    "documents",
    "overview",
    "tasks",
    "workplan",
    "activity",
    "problems",
  ];
  const deliveryOrder: ProjectDashboardTab[] = [
    "overview",
    "tasks",
    "workplan",
    "quote",
    "documents",
    "activity",
    "problems",
  ];

  const order = quotePrep ? salesOrder : deliveryOrder;

  return order.filter((tab) => {
    if (tab === "quote" && isManualQuoteWorkspaceEnabled()) return true;
    return isProjectDashboardTabVisible(tab, modules);
  });
}
