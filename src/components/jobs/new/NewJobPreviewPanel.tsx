"use client";

import Link from "next/link";
import { Button } from "@/components/ui/button";
import { useI18n } from "@/i18n/I18nContext";
import { cn } from "@/lib/utils";
import { nj } from "./newJobFormStyles";
import type { NewJobStepId } from "./NewJobStepper";

type Props = {
  workTypeLabel: string;
  contactLabel: string;
  contactPersonLabel?: string | null;
  activeStep: NewJobStepId;
  submitLabel: string;
  loading: boolean;
  submitError: string | null;
  onSubmit: () => void;
  showSubmit: boolean;
};

const DEFAULT_NEXT_KEYS = ["next1", "next2", "next3"] as const;
const AI_REVIEW_NEXT_KEYS = ["nextAiReview1", "nextAiReview2", "nextAiReview3"] as const;

function nextStepHighlightIndex(activeStep: NewJobStepId): number {
  switch (activeStep) {
    case "type":
      return 0;
    case "contact":
      return 1;
    case "method":
    case "manual-details":
    case "ai-brief":
      return 2;
    case "ai-review":
      return 0;
    case "concept":
      return 2;
    default:
      return 0;
  }
}

function nextStepKeys(activeStep: NewJobStepId): readonly string[] {
  return activeStep === "ai-review" ? AI_REVIEW_NEXT_KEYS : DEFAULT_NEXT_KEYS;
}

export function NewJobPreviewPanel({
  workTypeLabel,
  contactLabel,
  contactPersonLabel,
  activeStep,
  submitLabel,
  loading,
  submitError,
  onSubmit,
  showSubmit,
}: Props) {
  const { t } = useI18n();
  const highlightIdx = nextStepHighlightIndex(activeStep);
  const stepKeys = nextStepKeys(activeStep);

  return (
    <div className={nj.previewPanel}>
      <div className="px-8 pt-8 pb-6">
        <h2 className="text-xl sm:text-[22px] font-bold text-white tracking-tight">
          {t("projects.new.preview.title")}
        </h2>

        <dl className={cn(nj.previewMeta, "mt-6")}>
          <div className="flex justify-between gap-4 items-baseline">
            <dt className="text-white/60">{t("projects.new.preview.type")}</dt>
            <dd className="font-semibold text-white text-right">{workTypeLabel}</dd>
          </div>
          <div className="flex justify-between gap-4 items-start">
            <dt className="text-white/60 shrink-0 pt-0.5">{t("projects.new.preview.customer")}</dt>
            <dd className="font-semibold text-white text-right min-w-0 max-w-[58%]">
              <span className="block truncate">{contactLabel}</span>
              {contactPersonLabel ? (
                <span className="mt-1 block text-sm font-medium text-white/70 truncate">
                  {t("projects.new.preview.contactPerson")}: {contactPersonLabel}
                </span>
              ) : null}
            </dd>
          </div>
          <div className="flex justify-between gap-4 items-baseline">
            <dt className="text-white/60">{t("projects.new.preview.status")}</dt>
            <dd>
              <span className="inline-flex items-center rounded-full bg-[#E95F2A]/20 px-3 py-1 text-sm font-semibold text-[#FFB088]">
                {t("projects.new.preview.statusValue")}
              </span>
            </dd>
          </div>
        </dl>
      </div>

      <div className="mx-8 h-px bg-white/10" aria-hidden />

      <div className="px-8 py-6">
        <p className="text-sm font-semibold text-white/60 uppercase tracking-wide mb-4">
          {t("projects.new.preview.nextHeading")}
        </p>
        <ol className="space-y-3" role="list">
          {stepKeys.map((key, index) => {
            const highlighted = index === highlightIdx;
            return (
              <li
                key={key}
                className={cn(
                  "flex items-start gap-3 rounded-xl px-3 py-2.5 text-[15px] transition-colors",
                  highlighted ? "bg-white/10 text-white" : "text-white/75"
                )}
              >
                <span
                  className={cn(
                    "flex size-7 shrink-0 items-center justify-center rounded-full text-sm font-bold",
                    highlighted
                      ? "bg-[#E95F2A] text-white"
                      : "bg-white/10 text-white/70"
                  )}
                  aria-hidden
                >
                  {index + 1}
                </span>
                <span className={cn("pt-0.5 leading-snug", highlighted && "font-semibold")}>
                  {t(`projects.new.preview.${key}`)}
                </span>
              </li>
            );
          })}
        </ol>
      </div>

      {submitError ? (
        <p className="px-8 text-sm font-medium text-[#FCA5A5]" role="alert">
          {submitError}
        </p>
      ) : null}

      <div className="px-8 pb-8 pt-2 space-y-3">
        {showSubmit ? (
          <Button
            type="button"
            disabled={loading}
            className={nj.primaryCta}
            onClick={onSubmit}
          >
            {loading ? t("common.loading") : submitLabel}
          </Button>
        ) : null}
        <Link href="/app/projects" className={nj.secondaryLink}>
          {t("projects.new.backToList")}
        </Link>
      </div>
    </div>
  );
}
