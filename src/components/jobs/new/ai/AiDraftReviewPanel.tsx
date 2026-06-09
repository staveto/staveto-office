"use client";

import { AlertCircle, Loader2, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useI18n } from "@/i18n/I18nContext";
import type { AiProjectDraftLocal } from "@/lib/aiProjectDraftLocal";
import { isWizardAiGenerationEnabled } from "@/services/ai/aiWizardGenerationService";
import { njNavPrimary, njNavSecondary } from "../newJobFormStyles";
import type { AiRefineNodeTarget } from "./aiDraftReviewTypes";
import { AiDraftReviewWorkspace } from "./AiDraftReviewWorkspace";

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
}: Props) {
  const { t } = useI18n();
  const canGenerate = isWizardAiGenerationEnabled();

  if (mode === "generating") {
    return (
      <div className="flex flex-col items-center justify-center gap-4 py-16 text-center">
        <Loader2 className="size-10 animate-spin text-[#E95F2A]" aria-hidden />
        <p className="text-[#475569]">
          {generatingWithAttachments
            ? t("projects.new.ai.review.generatingWithDocs")
            : t("projects.new.ai.review.generating")}
        </p>
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

        <div className="rounded-xl border border-dashed border-[#E95F2A]/40 bg-[#FFF8F5] px-5 py-6 space-y-3">
          <div className="flex items-center gap-2 text-[#0F2A4D] font-semibold">
            <Sparkles className="size-5 text-[#E95F2A]" aria-hidden />
            {generateError
              ? t("projects.new.ai.review.failedTitle")
              : t("projects.new.ai.review.placeholderTitle")}
          </div>
          <p className="text-sm text-[#475569] leading-relaxed">
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
          <div className="flex gap-2 text-sm text-destructive" role="alert">
            <AlertCircle className="size-5 shrink-0" aria-hidden />
            <span>{generateError}</span>
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
      onContinueManual={onContinueManual}
      onConfirm={onConfirm}
      confirmError={confirmError}
    />
  );
}
