import type { AgentInsight } from "./managerAgentContract";

export type ManagerAgentDisplayMode = "off" | "minimized" | "proactive" | "open";

const DISPLAY_MODE_KEY = "staveto.managerAgent.displayMode";
const DISMISSED_HINTS_KEY = "staveto.managerAgent.dismissedHints";
const SNOOZED_UNTIL_KEY = "staveto.managerAgent.snoozedUntil";
const HIDDEN_SCREENS_KEY = "staveto.managerAgent.hiddenScreens";

const VALID_MODES: ManagerAgentDisplayMode[] = ["off", "minimized", "proactive", "open"];

export function getDefaultDisplayMode(): ManagerAgentDisplayMode {
  return "proactive";
}

export function loadDisplayMode(): ManagerAgentDisplayMode {
  if (typeof window === "undefined") return getDefaultDisplayMode();
  try {
    const raw = window.localStorage.getItem(DISPLAY_MODE_KEY);
    if (!raw || !VALID_MODES.includes(raw as ManagerAgentDisplayMode)) {
      return getDefaultDisplayMode();
    }
    return raw as ManagerAgentDisplayMode;
  } catch {
    return getDefaultDisplayMode();
  }
}

export function saveDisplayMode(mode: ManagerAgentDisplayMode): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(DISPLAY_MODE_KEY, mode);
}

export function loadDismissedHints(): string[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(DISMISSED_HINTS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed)
      ? parsed.filter((value): value is string => typeof value === "string")
      : [];
  } catch {
    return [];
  }
}

export function dismissHint(hintId: string): void {
  if (typeof window === "undefined") return;
  const next = [...new Set([...loadDismissedHints(), hintId])];
  window.localStorage.setItem(DISMISSED_HINTS_KEY, JSON.stringify(next));
}

export function loadSnoozedUntil(): number | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(SNOOZED_UNTIL_KEY);
    if (!raw) return null;
    const parsed = Number(raw);
    return Number.isFinite(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export function snoozeHintsForHours(hours: number): void {
  if (typeof window === "undefined") return;
  const until = Date.now() + hours * 60 * 60 * 1000;
  window.localStorage.setItem(SNOOZED_UNTIL_KEY, String(until));
}

export function isSnoozed(now = Date.now()): boolean {
  const until = loadSnoozedUntil();
  return until != null && until > now;
}

export function clearSnooze(): void {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(SNOOZED_UNTIL_KEY);
}

export function loadHiddenScreens(): string[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(HIDDEN_SCREENS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed)
      ? parsed.filter((value): value is string => typeof value === "string")
      : [];
  } catch {
    return [];
  }
}

export function hideProactiveOnScreen(screenKey: string): void {
  if (typeof window === "undefined") return;
  const next = [...new Set([...loadHiddenScreens(), screenKey])];
  window.localStorage.setItem(HIDDEN_SCREENS_KEY, JSON.stringify(next));
}

export function isScreenHidden(screenKey: string): boolean {
  return loadHiddenScreens().includes(screenKey);
}

export function pruneHiddenScreensForWorkspace(workspaceId: string | null): void {
  if (typeof window === "undefined" || !workspaceId) return;
  const prefix = `${workspaceId}:`;
  const next = loadHiddenScreens().filter((key) => key.startsWith(prefix));
  window.localStorage.setItem(HIDDEN_SCREENS_KEY, JSON.stringify(next));
}

export function buildProactiveScreenKey(
  workspaceId: string | null,
  screenType: string
): string {
  return `${workspaceId ?? "none"}:${screenType}`;
}

const PROACTIVE_EXCLUDED_IDS = new Set(["local-dashboard-next"]);

const SEVERITY_RANK: Record<AgentInsight["severity"], number> = {
  critical: 0,
  warning: 1,
  opportunity: 2,
  info: 3,
};

export function isProactiveCandidate(insight: AgentInsight): boolean {
  if (insight.source !== "local") return false;
  if (PROACTIVE_EXCLUDED_IDS.has(insight.id)) return false;
  return (
    insight.severity === "critical" ||
    insight.severity === "warning" ||
    insight.severity === "opportunity"
  );
}

export function selectProactiveInsight(insights: AgentInsight[]): AgentInsight | null {
  const candidates = insights.filter(isProactiveCandidate);
  if (candidates.length === 0) return null;
  return [...candidates].sort(
    (a, b) => SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity]
  )[0];
}

export function shouldShowProactiveHint(params: {
  displayMode: ManagerAgentDisplayMode;
  hint: AgentInsight | null;
  screenKey: string;
  inputFocused: boolean;
  modalOpen: boolean;
  now?: number;
}): boolean {
  if (params.displayMode !== "proactive") return false;
  if (!params.hint) return false;
  if (params.inputFocused || params.modalOpen) return false;
  if (isSnoozed(params.now)) return false;
  if (isScreenHidden(params.screenKey)) return false;
  if (loadDismissedHints().includes(params.hint.id)) return false;
  return true;
}

export function getFloatingDockLayout(messagesExpanded: boolean) {
  return {
    dockClassName: "fixed bottom-4 right-4 z-50 flex flex-col-reverse items-end gap-3",
    messagesWidthPx: 360,
    agentPanelWidthPx: 420,
    agentPanelClassName: "w-[min(420px,calc(100vw-2rem))]",
    agentPanelShiftClassName: messagesExpanded
      ? "md:-translate-x-[calc(360px+0.75rem)]"
      : "",
  };
}
