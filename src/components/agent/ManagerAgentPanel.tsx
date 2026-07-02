"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Sparkles, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useI18n } from "@/i18n/I18nContext";
import {
  managerScreenTypeLabelKey,
  useManagerScreenContext,
  useOptionalManagerAgentActionHandlers,
} from "@/context/ManagerAgentContext";
import { useFloatingDock } from "@/context/FloatingDockContext";
import type { AgentSuggestedAction } from "@/lib/agent/managerAgentContract";
import {
  buildProactiveScreenKey,
  dismissHint,
  getDefaultDisplayMode,
  getFloatingDockLayout,
  hideProactiveOnScreen,
  isSnoozed,
  loadDisplayMode,
  loadHiddenScreens,
  pruneHiddenScreensForWorkspace,
  saveDisplayMode,
  selectProactiveInsight,
  shouldShowProactiveHint,
  snoozeHintsForHours,
  type ManagerAgentDisplayMode,
} from "@/lib/agent/managerAgentDisplay";
import {
  isManagerAgentEnabledForScreen,
  loadManagerAgentPreferences,
} from "@/lib/agent/managerAgentPreferences";
import {
  analyzeManagerScreenLocally,
  askManagerAgent,
} from "@/services/agent/managerAgentService";
import {
  localizeAgentInsights,
} from "@/lib/agent/managerAgentI18n";
import { runManagerAgentLocalRules } from "@/lib/agent/managerAgentLocalRules";
import { cn } from "@/lib/utils";
import { AgentInsightCard } from "./AgentInsightCard";
import { ManagerAgentButton } from "./ManagerAgentButton";
import { ManagerAgentModeControls } from "./ManagerAgentModeControls";
import { ManagerAgentProactiveHint } from "./ManagerAgentProactiveHint";

type LayoutConfig = ReturnType<typeof getFloatingDockLayout>;

type Props = {
  embedded?: boolean;
  messagesExpanded?: boolean;
  layout?: LayoutConfig;
};

export function ManagerAgentPanel({
  embedded = false,
  messagesExpanded = false,
  layout,
}: Props) {
  const { t, locale } = useI18n();
  const router = useRouter();
  const screenContext = useManagerScreenContext();
  const agentActionHandlers = useOptionalManagerAgentActionHandlers();
  const { inputFocused, modalOpen } = useFloatingDock();
  const [displayMode, setDisplayMode] = useState<ManagerAgentDisplayMode>(() =>
    typeof window !== "undefined" ? loadDisplayMode() : getDefaultDisplayMode()
  );
  const [ephemeralPanelOpen, setEphemeralPanelOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [summary, setSummary] = useState<string | null>(null);
  const [insights, setInsights] = useState<
    ReturnType<typeof analyzeManagerScreenLocally>["insights"]
  >([]);
  const [dismissedHintIds, setDismissedHintIds] = useState<string[]>([]);
  const [snoozed, setSnoozed] = useState(false);
  const [hiddenScreens, setHiddenScreens] = useState<string[]>([]);

  const dockLayout = layout ?? getFloatingDockLayout(messagesExpanded);
  const prefs = useMemo(() => loadManagerAgentPreferences(), [displayMode]);
  const enabledForScreen =
    screenContext &&
    displayMode !== "off" &&
    isManagerAgentEnabledForScreen(prefs, screenContext.screenType);

  const panelOpen = displayMode === "open" || ephemeralPanelOpen;
  const screenKey = buildProactiveScreenKey(
    screenContext?.activeWorkspaceId ?? null,
    screenContext?.screenType ?? "unknown"
  );

  const localInsights = useMemo(() => {
    if (!screenContext) return [];
    return localizeAgentInsights(runManagerAgentLocalRules(screenContext), locale);
  }, [screenContext, locale]);

  const proactiveInsight = useMemo(
    () => selectProactiveInsight(localInsights),
    [localInsights]
  );

  const showProactiveHint =
    enabledForScreen &&
    shouldShowProactiveHint({
      displayMode,
      hint: proactiveInsight,
      screenKey,
      inputFocused,
      modalOpen,
    }) &&
    !dismissedHintIds.includes(proactiveInsight?.id ?? "") &&
    !hiddenScreens.includes(screenKey) &&
    !snoozed;

  useEffect(() => {
    setDisplayMode(loadDisplayMode());
  }, []);

  useEffect(() => {
    if (!screenContext?.activeWorkspaceId) return;
    pruneHiddenScreensForWorkspace(screenContext.activeWorkspaceId);
    setHiddenScreens(loadHiddenScreens());
    setSnoozed(isSnoozed());
  }, [screenContext?.activeWorkspaceId]);

  useEffect(() => {
    if (messagesExpanded && ephemeralPanelOpen) {
      setEphemeralPanelOpen(false);
    }
  }, [messagesExpanded, ephemeralPanelOpen]);

  useEffect(() => {
    if (!panelOpen) return;
    setError(null);
    const local = analyzeManagerScreenLocally(screenContext, locale);
    setInsights(local.insights);
    setSummary(local.summary);
  }, [locale, panelOpen, screenContext]);

  const persistMode = useCallback((mode: ManagerAgentDisplayMode) => {
    setDisplayMode(mode);
    saveDisplayMode(mode);
    if (mode !== "open") {
      setEphemeralPanelOpen(false);
    }
  }, []);

  const openPanel = useCallback(() => {
    if (messagesExpanded) return;
    if (displayMode === "open") return;
    setEphemeralPanelOpen(true);
  }, [displayMode, messagesExpanded]);

  const closePanel = useCallback(() => {
    if (displayMode === "open") {
      persistMode("proactive");
      return;
    }
    setEphemeralPanelOpen(false);
  }, [displayMode, persistMode]);

  const runAnalysis = useCallback(
    async (mode: "analyze_screen" | "next_best_action") => {
      if (!screenContext) {
        setError(t("agent.error.noWorkspace"));
        return;
      }

      setLoading(true);
      setError(null);
      try {
        const result = await askManagerAgent({
          screenContext,
          mode,
          locale,
          question:
            mode === "next_best_action"
              ? "What should the manager do next on this screen?"
              : undefined,
        });
        setInsights(result.insights);
        setSummary(result.summary);
      } catch {
        setError(t("agent.error.generic"));
        const fallback = analyzeManagerScreenLocally(screenContext, locale);
        setInsights(fallback.insights);
        setSummary(fallback.summary);
      } finally {
        setLoading(false);
      }
    },
    [locale, screenContext, t]
  );

  const handleSuggestedAction = useCallback(
    async (action: AgentSuggestedAction) => {
      if (agentActionHandlers) {
        const handled = await agentActionHandlers.dispatchAction(action);
        if (handled) return;
      }

      if (action.type === "navigate" && action.targetRoute) {
        router.push(action.targetRoute);
        return;
      }
      if (action.type === "open_ai_assistant" && action.targetRoute) {
        router.push(action.targetRoute);
        return;
      }
      if (action.type === "open_ai_brief") {
        router.push("/app/projects/new");
        return;
      }
      if (action.type === "copy_text" && action.proposedPatch) {
        const text = Object.values(action.proposedPatch).join("\n");
        void navigator.clipboard?.writeText(text);
      }
    },
    [agentActionHandlers, router]
  );

  const handleDismissHint = useCallback(() => {
    if (!proactiveInsight) return;
    dismissHint(proactiveInsight.id);
    setDismissedHintIds((prev) => [...prev, proactiveInsight.id]);
  }, [proactiveInsight]);

  const handleSnooze = useCallback(() => {
    snoozeHintsForHours(1);
    setSnoozed(true);
  }, []);

  const handleHideOnScreen = useCallback(() => {
    hideProactiveOnScreen(screenKey);
    setHiddenScreens((prev) => [...prev, screenKey]);
  }, [screenKey]);

  if (!enabledForScreen) return null;

  const showButton =
    displayMode === "minimized" ||
    displayMode === "proactive" ||
    displayMode === "open";

  const handleButtonClick = () => {
    if (panelOpen) {
      closePanel();
      return;
    }
    if (messagesExpanded) return;
    openPanel();
  };

  return (
    <div className={cn("flex flex-col items-end gap-3", embedded ? "" : "fixed bottom-4 right-4 z-50")}>
      {showProactiveHint && proactiveInsight ? (
        <ManagerAgentProactiveHint
          insight={proactiveInsight}
          onOpen={() => {
            handleDismissHint();
            openPanel();
          }}
          onDismiss={handleDismissHint}
          onSnooze={handleSnooze}
        />
      ) : null}

      {panelOpen ? (
        <aside
          className={cn(
            "flex max-h-[min(720px,calc(100vh-2rem))] flex-col overflow-hidden rounded-2xl border border-[#CBD5E1] bg-white shadow-2xl dark:bg-background",
            dockLayout.agentPanelClassName,
            dockLayout.agentPanelShiftClassName
          )}
          aria-label={t("agent.title")}
        >
          <div className="flex items-start justify-between gap-3 border-b border-[#E2E8F0] px-4 py-4">
            <div>
              <div className="flex items-center gap-2">
                <Sparkles className="size-4 text-[#E95F2A]" aria-hidden />
                <h2 className="text-base font-bold text-[#0F2A4D] dark:text-foreground">
                  {t("agent.title")}
                </h2>
              </div>
              {screenContext ? (
                <p className="mt-1 text-sm text-[#64748B]">
                  {t(managerScreenTypeLabelKey(screenContext.screenType))}
                  {screenContext.activeWorkspaceName
                    ? ` · ${screenContext.activeWorkspaceName}`
                    : null}
                </p>
              ) : (
                <p className="mt-1 text-sm text-[#64748B]">{t("agent.error.noWorkspace")}</p>
              )}
            </div>
            <Button type="button" variant="ghost" size="icon" onClick={closePanel}>
              <X className="size-4" />
            </Button>
          </div>

          {messagesExpanded ? (
            <div className="border-b border-[#E2E8F0] bg-[#FFF7ED] px-4 py-2 text-sm text-[#9A3412]">
              {t("agent.messagesOpenHint")}
            </div>
          ) : null}

          <div className="flex flex-wrap gap-2 border-b border-[#E2E8F0] px-4 py-3">
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={loading || !screenContext || messagesExpanded}
              onClick={() => void runAnalysis("analyze_screen")}
            >
              {t("agent.analyzeScreen")}
            </Button>
            <Button
              type="button"
              size="sm"
              className="bg-[#E95F2A] hover:bg-[#c95a30] text-white"
              disabled={loading || !screenContext || messagesExpanded}
              onClick={() => void runAnalysis("next_best_action")}
            >
              {t("agent.nextBestAction")}
            </Button>
          </div>

          <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
            {loading ? (
              <div className="flex items-center justify-center gap-2 py-10 text-sm text-[#64748B]">
                <Loader2 className="size-5 animate-spin" aria-hidden />
                {t("common.loading")}
              </div>
            ) : null}

            {!loading && summary ? (
              <p className="rounded-lg bg-[#F6F8FB] px-3 py-2 text-sm text-[#475569]">{summary}</p>
            ) : null}

            {!loading && error ? (
              <p className="text-sm text-destructive" role="alert">
                {error}
              </p>
            ) : null}

            {!loading && insights.length === 0 ? (
              <div className="rounded-xl border border-dashed border-[#CBD5E1] px-4 py-10 text-center text-sm text-[#64748B]">
                {t("agent.empty")}
              </div>
            ) : null}

            {!loading
              ? insights.map((insight) => (
                  <AgentInsightCard
                    key={insight.id}
                    severity={insight.severity}
                    title={insight.title}
                    message={insight.message}
                    reason={insight.reason}
                    requiresConfirmation={insight.requiresConfirmation}
                    suggestedAction={insight.suggestedAction}
                    onAction={handleSuggestedAction}
                    confirmLabel={t("agent.needsConfirmation")}
                  />
                ))
              : null}
          </div>

          <ManagerAgentModeControls
            mode={displayMode}
            onModeChange={persistMode}
            onSnooze={handleSnooze}
            onHideOnScreen={handleHideOnScreen}
            onTurnOff={() => persistMode("off")}
          />
        </aside>
      ) : null}

      {showButton ? (
        <ManagerAgentButton
          open={panelOpen}
          onClick={handleButtonClick}
          disabled={messagesExpanded && !panelOpen}
          title={messagesExpanded ? t("agent.messagesOpenHint") : undefined}
        />
      ) : null}
    </div>
  );
}
