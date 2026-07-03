"use client";

import { useEffect, useMemo, useState } from "react";
import { Check, Circle, Loader2 } from "lucide-react";
import { useI18n } from "@/i18n/I18nContext";
import { cn } from "@/lib/utils";
import { nj } from "../newJobFormStyles";

export type AiGenerationStage =
  | "sending"
  | "attachments"
  | "draft"
  | "long_wait";

type Props = {
  attachmentCount: number;
  attachmentNames?: string[];
  startedAt?: number;
};

function stageIndex(stage: AiGenerationStage, hasAttachments: boolean): number {
  const order: AiGenerationStage[] = hasAttachments
    ? ["sending", "attachments", "draft", "long_wait"]
    : ["sending", "draft", "long_wait"];
  return order.indexOf(stage);
}

export function useAiGenerationStage(
  active: boolean,
  attachmentCount: number
): AiGenerationStage {
  const [stage, setStage] = useState<AiGenerationStage>("sending");
  const hasAttachments = attachmentCount > 0;

  useEffect(() => {
    if (!active) {
      setStage("sending");
      return;
    }

    const t0 = Date.now();
    const timers: ReturnType<typeof setTimeout>[] = [];

    timers.push(
      setTimeout(() => {
        if (hasAttachments) setStage("attachments");
        else setStage("draft");
      }, 2500)
    );

    if (hasAttachments) {
      timers.push(setTimeout(() => setStage("draft"), 12_000));
    }

    timers.push(
      setTimeout(() => setStage("long_wait"), hasAttachments ? 45_000 : 25_000)
    );

    return () => {
      timers.forEach(clearTimeout);
      void t0;
    };
  }, [active, hasAttachments]);

  return stage;
}

export function AiDraftGenerationProgress({
  attachmentCount,
  attachmentNames = [],
  startedAt,
}: Props) {
  const { t } = useI18n();
  const hasAttachments = attachmentCount > 0;
  const stage = useAiGenerationStage(true, attachmentCount);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    const id = setInterval(() => setTick((n) => n + 1), 1000);
    return () => clearInterval(id);
  }, []);

  const elapsedSec = startedAt ? Math.floor((Date.now() - startedAt) / 1000) : 0;
  void tick;

  const steps = useMemo(() => {
    const base: { id: AiGenerationStage; label: string }[] = [
      {
        id: "sending",
        label: t("projects.new.ai.review.progress.sending"),
      },
    ];
    if (hasAttachments) {
      base.push({
        id: "attachments",
        label: t("projects.new.ai.review.progress.attachments", {
          count: String(attachmentCount),
        }),
      });
    }
    base.push(
      {
        id: "draft",
        label: t("projects.new.ai.review.progress.draft"),
      },
      {
        id: "long_wait",
        label: t("projects.new.ai.review.progress.longWait"),
      }
    );
    return base;
  }, [attachmentCount, hasAttachments, t]);

  const currentIdx = stageIndex(stage, hasAttachments);

  return (
    <div className="max-w-lg mx-auto space-y-5" data-testid="ai-generation-progress">
      <div className="flex flex-col items-center gap-3 text-center">
        <Loader2 className="size-10 animate-spin text-[#E95F2A]" aria-hidden />
        <p className="text-sm font-semibold text-[#0F2A4D] dark:text-[#F8FAFC]">
          {hasAttachments
            ? t("projects.new.ai.review.generatingWithDocs")
            : t("projects.new.ai.review.generating")}
        </p>
        {startedAt ? (
          <p className="text-xs text-[#64748B] dark:text-[#94A3B8]">
            {t("projects.new.ai.review.progress.elapsed", { seconds: String(elapsedSec) })}
          </p>
        ) : null}
      </div>

      <ol className="space-y-2" aria-label={t("projects.new.ai.review.progress.aria")}>
        {steps.map((step, idx) => {
          const done = idx < currentIdx;
          const current = idx === currentIdx;
          return (
            <li
              key={step.id}
              className={cn(
                "flex items-start gap-3 rounded-lg border px-3 py-2.5 text-sm transition-colors",
                current
                  ? "border-[#E95F2A]/50 bg-[#FFF8F5] dark:bg-[#3A2A22] dark:border-[#E95F2A]/40"
                  : done
                    ? "border-[#E2E8F0] bg-[#F8FAFC] dark:border-[#334155] dark:bg-[#243247]"
                    : "border-[#E2E8F0] bg-white opacity-60 dark:border-[#334155] dark:bg-[#1E293B]"
              )}
            >
              <span className="mt-0.5 shrink-0" aria-hidden>
                {done ? (
                  <Check className="size-4 text-[#16A34A]" />
                ) : current ? (
                  <Loader2 className="size-4 animate-spin text-[#E95F2A]" />
                ) : (
                  <Circle className="size-4 text-[#CBD5E1] dark:text-[#475569]" />
                )}
              </span>
              <span
                className={cn(
                  "leading-snug",
                  current
                    ? "font-semibold text-[#0F2A4D] dark:text-[#F8FAFC]"
                    : "text-[#64748B] dark:text-[#94A3B8]"
                )}
              >
                {step.label}
              </span>
            </li>
          );
        })}
      </ol>

      {attachmentNames.length > 0 ? (
        <div className={cn(nj.infoBox, "text-left")}>
          <p className="font-semibold text-[#0F2A4D] dark:text-[#F8FAFC] text-xs mb-1">
            {t("projects.new.ai.review.progress.filesTitle")}
          </p>
          <ul className="text-xs space-y-0.5 list-disc pl-4">
            {attachmentNames.slice(0, 5).map((name) => (
              <li key={name} className="truncate">
                {name}
              </li>
            ))}
            {attachmentNames.length > 5 ? (
              <li>{t("projects.new.ai.review.progress.moreFiles", { count: String(attachmentNames.length - 5) })}</li>
            ) : null}
          </ul>
        </div>
      ) : null}

      <p className="text-xs text-center text-[#64748B] dark:text-[#94A3B8] leading-relaxed">
        {t("projects.new.ai.review.progress.backendNote")}
      </p>
    </div>
  );
}
