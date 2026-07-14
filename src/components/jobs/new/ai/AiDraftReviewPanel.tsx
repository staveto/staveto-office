"use client";

import { AlertCircle, Loader2, Sparkles } from "lucide-react";
import { useEffect, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { useI18n } from "@/i18n/I18nContext";
import type { AiProjectDraftLocal } from "@/lib/aiProjectDraftLocal";
import { isWizardAiGenerationEnabled } from "@/services/ai/aiWizardGenerationService";
import { njNavPrimary, njNavSecondary } from "../newJobFormStyles";
import type { AiRefineNodeTarget } from "./aiDraftReviewTypes";
import { AiDraftGenerationProgress } from "./AiDraftGenerationProgress";
import {
  AiDraftReviewWorkspace,
  type AttachmentQuickAction,
} from "./AiDraftReviewWorkspace";
import { AiEstimatorReviewPanel } from "./AiEstimatorReviewPanel";
import { AiEstimatorFlowStatusBanner } from "./AiEstimatorFlowStatusBanner";
import type {
  AiEstimateLine,
  AiEstimatorFacts,
  AiQuoteDraft,
} from "@/types/aiEstimator";
import { isAiEstimatorFlowEnabled } from "@/lib/ai/aiEstimatorFeature";
import { foldLegendIntoEstimatorFacts } from "@/lib/ai/foldLegendIntoEstimatorFacts";
import { syncDraftMaterialsFromEstimatorFacts } from "@/lib/ai/enrichPlanWithEstimatorFacts";
import type { UploadedAiDraftFile } from "@/services/ai/aiDraftFiles";

export type AiDraftReviewMode = "placeholder" | "draft" | "generating";

type Props = {
  mode: AiDraftReviewMode;
  draft: AiProjectDraftLocal | null;
  generateError?: string | null;
  confirming?: boolean;
  regenerating?: boolean;
  refiningKey?: string | null;
  onProjectTitleChange?: (title: string) => void;
  onPhaseChange: (phaseId: string, patch: { name?: string; description?: string }) => void;
  onPhaseRemove: (phaseId: string) => void;
  onTaskChange: (
    phaseId: string,
    taskId: string,
    patch: { title?: string; description?: string }
  ) => void;
  onTaskRemove: (phaseId: string, taskId: string) => void;
  onMaterialToggle?: (materialId: string, selected: boolean) => void;
  onRefine?: (target: AiRefineNodeTarget, changeRequest: string) => Promise<void>;
  onRegenerate?: () => void;
  onContinueManual: () => void;
  onConfirm?: () => void;
  onRetryGenerate?: () => void;
  showCallablePendingNote?: boolean;
  generateWarnings?: string[];
  confirmError?: string | null;
  generatingWithAttachments?: boolean;
  generatingStartedAt?: number | null;
  attachmentFileNames?: string[];
  attachmentFiles?: UploadedAiDraftFile[];
  generateErrorDetail?: string | null;
  onAttachmentQuickAction?: (action: AttachmentQuickAction) => Promise<void>;
  attachmentQuickActionsDisabled?: boolean;
  estimatorSessionId?: string | null;
  estimatorFacts?: AiEstimatorFacts | null;
  estimateLines?: AiEstimateLine[];
  quoteDraft?: AiQuoteDraft | null;
  estimatorBusy?: boolean;
  onBuildEstimate?: () => Promise<void>;
  onBuildQuote?: () => Promise<void>;
  onCreateQuoteProject?: () => Promise<void>;
  estimatorFallbackReason?: string | null;
  onDraftMaterialsSync?: (draft: AiProjectDraftLocal) => void;
  linkedProjectId?: string | null;
  visualTakeoffBusy?: boolean;
  onStartVisualTakeoff?: () => Promise<void> | void;
  onSkipVisualTakeoff?: () => Promise<void> | void;
};

export function AiDraftReviewPanel({
  mode,
  draft,
  generateError,
  confirming,
  regenerating,
  refiningKey,
  onProjectTitleChange,
  onPhaseChange,
  onPhaseRemove,
  onTaskChange,
  onTaskRemove,
  onMaterialToggle,
  onRefine,
  onRegenerate,
  onContinueManual,
  onConfirm,
  onRetryGenerate,
  showCallablePendingNote = false,
  generateWarnings = [],
  confirmError = null,
  generatingWithAttachments = false,
  generatingStartedAt = null,
  attachmentFileNames = [],
  attachmentFiles = [],
  generateErrorDetail = null,
  onAttachmentQuickAction,
  attachmentQuickActionsDisabled = false,
  estimatorSessionId = null,
  estimatorFacts = null,
  estimateLines = [],
  quoteDraft = null,
  estimatorBusy = false,
  onBuildEstimate,
  onBuildQuote,
  onCreateQuoteProject,
  estimatorFallbackReason = null,
  onDraftMaterialsSync,
  linkedProjectId = null,
  visualTakeoffBusy = false,
  onStartVisualTakeoff,
  onSkipVisualTakeoff,
}: Props) {
  const { t } = useI18n();
  const canGenerate = isWizardAiGenerationEnabled();
  const displayFacts = useMemo(
    () => (estimatorFacts ? foldLegendIntoEstimatorFacts(estimatorFacts) : null),
    [estimatorFacts]
  );
  const showEstimator =
    isAiEstimatorFlowEnabled() && !!estimatorSessionId && !!displayFacts;

  const workspaceDraft = useMemo(() => {
    if (!draft || !displayFacts) return draft;
    return syncDraftMaterialsFromEstimatorFacts(draft, displayFacts);
  }, [draft, displayFacts]);

  useEffect(() => {
    if (!draft || !displayFacts || !onDraftMaterialsSync) return;
    const synced = syncDraftMaterialsFromEstimatorFacts(draft, displayFacts);
    const before = draft.materialSuggestions?.length ?? 0;
    const after = synced.materialSuggestions?.length ?? 0;
    if (after > before) onDraftMaterialsSync(synced);
    // Only re-sync when estimator facts change — not when draft materials update.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentional
  }, [displayFacts, onDraftMaterialsSync]);

  if (mode === "generating") {
    return (
      <div className="py-8">
        <AiDraftGenerationProgress
          attachmentCount={generatingWithAttachments ? attachmentFileNames.length : 0}
          attachmentNames={attachmentFileNames}
          startedAt={generatingStartedAt ?? undefined}
        />
      </div>
    );
  }

  if (mode === "placeholder" || !draft) {
    return (
      <div className="space-y-6 max-w-3xl">
        <div
          className="rounded-xl border border-[#CBD5E1] bg-[#F6F8FB] px-4 py-3 text-sm text-[#475569] leading-relaxed"
          role="status"
        >
          {t("projects.new.ai.safetyNotice")}
        </div>

        <div
          className="rounded-xl border border-dashed border-[#E95F2A]/40 bg-[#FFF8F5] px-5 py-6 space-y-3 dark:bg-[#3A2A22] dark:border-[#E95F2A]/50"
          role="status"
        >
          <div className="flex items-center gap-2 text-[#0F2A4D] dark:text-[#F8FAFC] font-semibold">
            <Sparkles className="size-5 text-[#E95F2A]" aria-hidden />
            {generateError
              ? t("projects.new.ai.review.failedTitle")
              : t("projects.new.ai.review.placeholderTitle")}
          </div>
          <p className="text-sm text-[#475569] dark:text-[#94A3B8] leading-relaxed">
            {generateError
              ? t("projects.new.ai.review.failedBody")
              : t("projects.new.ai.review.placeholderBody")}
          </p>
          {!generateError && !canGenerate ? (
            <p className="text-xs text-[#64748B]">{t("projects.new.ai.review.callablesPending")}</p>
          ) : null}
          {showCallablePendingNote && generateError ? (
            <p className="text-xs text-[#64748B]">{t("projects.new.ai.review.generateFailedHint")}</p>
          ) : null}
        </div>

        <div className="grid gap-4 sm:grid-cols-3">
          {(["phases", "tasks", "materials"] as const).map((key) => (
            <div
              key={key}
              className="rounded-lg border border-[#E2E8F0] bg-white px-4 py-5 text-center text-sm font-semibold text-[#94A3B8]"
            >
              {t(`projects.new.ai.review.section.${key}`)}
            </div>
          ))}
        </div>

        {generateError ? (
          <div className="space-y-2" role="alert">
            <div className="flex gap-2 text-sm text-destructive">
              <AlertCircle className="size-5 shrink-0" aria-hidden />
              <span className="font-semibold">{generateError}</span>
            </div>
            {generateErrorDetail && generateErrorDetail !== generateError ? (
              <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-900 dark:border-red-900/50 dark:bg-red-950/40 dark:text-red-200">
                <p className="font-semibold mb-1">{t("projects.new.ai.review.errorDetailLabel")}</p>
                <p className="font-mono break-words whitespace-pre-wrap">{generateErrorDetail}</p>
              </div>
            ) : null}
          </div>
        ) : null}

        <div className="flex flex-wrap gap-3 pt-2">
          {canGenerate && onRetryGenerate ? (
            <Button type="button" className={njNavPrimary()} onClick={onRetryGenerate}>
              {t("projects.new.ai.review.tryGenerate")}
            </Button>
          ) : null}
          <Button type="button" variant="outline" className={njNavSecondary()} onClick={onContinueManual}>
            {t("projects.new.ai.continueManual")}
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {isAiEstimatorFlowEnabled() ? (
        <AiEstimatorFlowStatusBanner
          fallbackReason={estimatorFallbackReason}
          estimatorActive={showEstimator}
        />
      ) : null}
      {showEstimator && displayFacts && estimatorSessionId ? (
        <>
          <AiEstimatorReviewPanel
            facts={displayFacts}
            sessionId={estimatorSessionId}
            estimateLines={estimateLines}
            quoteDraft={quoteDraft}
            busy={estimatorBusy || regenerating || confirming}
            onBuildEstimate={onBuildEstimate}
            onBuildQuote={onBuildQuote}
            onCreateQuoteProject={onCreateQuoteProject}
            onCreateProjectOnly={onConfirm}
            attachmentFileNames={attachmentFileNames}
            attachmentFiles={attachmentFiles}
            linkedProjectId={linkedProjectId}
            visualTakeoffBusy={visualTakeoffBusy}
            onStartVisualTakeoff={onStartVisualTakeoff}
            onSkipVisualTakeoff={onSkipVisualTakeoff}
          />
          <details className="rounded-xl border border-[var(--border)] bg-[var(--card)] px-4 py-3">
            <summary className="cursor-pointer text-sm font-medium text-foreground hover:text-[var(--po-primary,#e06737)]">
              {t("projects.aiEstimator.cockpit.showExecutionDraft")}
            </summary>
            <p className="mt-2 text-xs text-muted-foreground leading-relaxed">
              {t("projects.aiEstimator.cockpit.executionDraftHint")}
            </p>
            <div className="mt-4">
              <AiDraftReviewWorkspace
                draft={workspaceDraft ?? draft!}
                confirming={confirming}
                regenerating={regenerating}
                refiningKey={refiningKey}
                generateWarnings={generateWarnings}
                onProjectTitleChange={(title) => onProjectTitleChange?.(title)}
                onPhaseChange={onPhaseChange}
                onPhaseRemove={onPhaseRemove}
                onTaskChange={onTaskChange}
                onTaskRemove={onTaskRemove}
                onMaterialToggle={(materialId, selected) =>
                  onMaterialToggle?.(materialId, selected)
                }
                onRefine={onRefine ?? (async () => {})}
                onRegenerate={onRegenerate}
                onAttachmentQuickAction={onAttachmentQuickAction}
                attachmentQuickActionsDisabled={attachmentQuickActionsDisabled}
                onContinueManual={onContinueManual}
                onConfirm={onConfirm}
                confirmError={confirmError}
                compactNotices
              />
            </div>
          </details>
        </>
      ) : (
        <AiDraftReviewWorkspace
          draft={draft}
          confirming={confirming}
          regenerating={regenerating}
          refiningKey={refiningKey}
          generateWarnings={generateWarnings}
          onProjectTitleChange={(title) => onProjectTitleChange?.(title)}
          onPhaseChange={onPhaseChange}
          onPhaseRemove={onPhaseRemove}
          onTaskChange={onTaskChange}
          onTaskRemove={onTaskRemove}
          onMaterialToggle={(materialId, selected) => onMaterialToggle?.(materialId, selected)}
          onRefine={onRefine ?? (async () => {})}
          onRegenerate={onRegenerate}
          onAttachmentQuickAction={onAttachmentQuickAction}
          attachmentQuickActionsDisabled={attachmentQuickActionsDisabled}
          onContinueManual={onContinueManual}
          onConfirm={onConfirm}
          confirmError={confirmError}
        />
      )}
    </div>
  );
}
