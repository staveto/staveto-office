"use client";

import { AlertCircle, Loader2, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useI18n } from "@/i18n/I18nContext";
import type { AiProjectDraftLocal } from "@/lib/aiProjectDraftLocal";
import { isWizardAiGenerationEnabled } from "@/services/ai/aiWizardGenerationService";
import { njNavPrimary, njNavSecondary } from "../newJobFormStyles";
import { AiDraftPhaseCard } from "./AiDraftPhaseCard";

export type AiDraftReviewMode = "placeholder" | "draft" | "generating";

type Props = {
  mode: AiDraftReviewMode;
  draft: AiProjectDraftLocal | null;
  generateError?: string | null;
  confirming?: boolean;
  onPhaseChange: (phaseId: string, patch: { name?: string; description?: string }) => void;
  onPhaseRemove: (phaseId: string) => void;
  onTaskChange: (
    phaseId: string,
    taskId: string,
    patch: { title?: string; description?: string }
  ) => void;
  onTaskRemove: (phaseId: string, taskId: string) => void;
  onMaterialToggle?: (materialId: string, selected: boolean) => void;
  onContinueManual: () => void;
  onConfirm?: () => void;
  onRetryGenerate?: () => void;
  /** When true, show hint under placeholder (generation failed or disabled). */
  showCallablePendingNote?: boolean;
  generateWarnings?: string[];
};

export function AiDraftReviewPanel({
  mode,
  draft,
  generateError,
  confirming,
  onPhaseChange,
  onPhaseRemove,
  onTaskChange,
  onTaskRemove,
  onMaterialToggle,
  onContinueManual,
  onConfirm,
  onRetryGenerate,
  showCallablePendingNote = false,
  generateWarnings = [],
}: Props) {
  const { t } = useI18n();
  const canGenerate = isWizardAiGenerationEnabled();

  if (mode === "generating") {
    return (
      <div className="flex flex-col items-center justify-center gap-4 py-16 text-center">
        <Loader2 className="size-10 animate-spin text-[#E95F2A]" aria-hidden />
        <p className="text-[#475569]">{t("projects.new.ai.review.generating")}</p>
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
    <div className="space-y-6 max-w-3xl">
      <div
        className="rounded-xl border border-[#CBD5E1] bg-[#F6F8FB] px-4 py-3 text-sm text-[#475569]"
        role="status"
      >
        {t("projects.new.ai.review.unsavedNotice")}
      </div>

      <header className="space-y-1">
        <h3 className="text-lg font-bold text-[#0F2A4D]">{draft.projectTitle}</h3>
        {draft.summary ? (
          <p className="text-sm text-[#64748B] leading-relaxed">{draft.summary}</p>
        ) : null}
      </header>

      {generateWarnings.length > 0 ? (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-950">
          <p className="font-medium">{t("projects.new.ai.documentsPartial")}</p>
          <ul className="mt-1 list-disc pl-4 space-y-0.5">
            {generateWarnings.map((w) => (
              <li key={w}>{w}</li>
            ))}
          </ul>
        </div>
      ) : null}

      <section className="space-y-4">
        <h4 className="text-sm font-bold text-[#0F2A4D] uppercase tracking-wide">
          {t("projects.new.ai.review.section.phases")}
        </h4>
        {draft.phases.map((phase, index) => (
          <AiDraftPhaseCard
            key={phase.id}
            phase={phase}
            phaseIndex={index}
            onPhaseChange={onPhaseChange}
            onPhaseRemove={onPhaseRemove}
            onTaskChange={onTaskChange}
            onTaskRemove={onTaskRemove}
          />
        ))}
      </section>

      {draft.materialSuggestions && draft.materialSuggestions.length > 0 ? (
        <section className="space-y-3">
          <h4 className="text-sm font-bold text-[#0F2A4D] uppercase tracking-wide">
            {t("projects.new.ai.review.section.materials")}
          </h4>
          <ul className="space-y-2" role="list">
            {draft.materialSuggestions.map((m) => (
              <li key={m.id}>
                <label className="flex items-start gap-3 rounded-lg border border-[#E2E8F0] px-3 py-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={m.selected}
                    onChange={(e) => onMaterialToggle?.(m.id, e.target.checked)}
                    className="mt-1 size-4"
                  />
                  <span className="text-sm text-[#334155]">
                    <span className="font-semibold">{m.name}</span>
                    {m.description ? (
                      <span className="block text-[#64748B]">{m.description}</span>
                    ) : null}
                  </span>
                </label>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <div className="flex flex-wrap gap-3 pt-4 border-t border-[#E2E8F0]">
        <Button
          type="button"
          className={njNavPrimary()}
          disabled={confirming}
          onClick={onConfirm}
        >
          {confirming ? t("common.loading") : t("projects.new.ai.review.confirm")}
        </Button>
        <Button type="button" variant="outline" className={njNavSecondary()} onClick={onContinueManual}>
          {t("projects.new.ai.continueManual")}
        </Button>
      </div>
    </div>
  );
}
