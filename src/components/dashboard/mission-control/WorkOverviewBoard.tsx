"use client";

import Link from "next/link";
import { ArrowRight, ChevronRight } from "lucide-react";
import { useI18n } from "@/i18n/I18nContext";
import { cn } from "@/lib/utils";
import { buttonVariants } from "@/components/ui/button";
import type { OpsWorkflowStage } from "./opsModel";
import { opsCardClassName } from "./opsStyles";

type WorkOverviewBoardProps = {
  stages: OpsWorkflowStage[];
  insight: boolean;
  ctaHref: string;
  ctaLabelKey: string;
  showCta: boolean;
};

export function WorkOverviewBoard({
  stages,
  insight,
  ctaHref,
  ctaLabelKey,
  showCta,
}: WorkOverviewBoardProps) {
  const { t } = useI18n();

  // The active stage is the earliest one that still holds open work. It is the
  // single place that gets the orange attention accent.
  const activeIndex = stages.findIndex((s) => s.value > 0);

  return (
    <section className={cn(opsCardClassName, "p-5 md:p-6")}>
      <div className="mb-4 flex items-center justify-between gap-3">
        <h2 className="text-base font-semibold tracking-tight text-foreground">
          {t("dashboard.ops.flow.title")}
        </h2>
        {showCta ? (
          <Link href={ctaHref} className={cn(buttonVariants({ size: "sm" }), "shrink-0")}>
            {t(ctaLabelKey)}
            <ArrowRight className="size-3.5" aria-hidden />
          </Link>
        ) : null}
      </div>

      {/* One connected flow: Angebote -> Geplant -> In Arbeit -> Abnahme -> Fertig.
          No inner card borders; stages are joined by arrows and scroll
          horizontally on narrow screens. */}
      <ol
        className="-mx-1 flex items-stretch gap-0 overflow-x-auto px-1 pb-1"
        role="list"
        aria-label={t("dashboard.ops.flow.title")}
      >
        {stages.map((stage, idx) => {
          const isActive = idx === activeIndex;
          const hasValue = stage.value > 0;
          return (
            <li key={stage.id} className="flex min-w-[104px] flex-1 items-stretch">
              <Link
                href={stage.href}
                className={cn(
                  "group flex flex-1 flex-col items-center justify-center gap-1.5 rounded-xl px-2 py-4 text-center transition-colors",
                  "hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40",
                  isActive &&
                    "bg-[#fff4ee] ring-1 ring-[#e06737]/25 dark:bg-[#e06737]/10 dark:ring-[#e06737]/30"
                )}
              >
                <span
                  className={cn(
                    "text-[13px] font-medium",
                    isActive ? "text-[#b4501f] dark:text-[#f0a883]" : "text-muted-foreground"
                  )}
                >
                  {t(stage.labelKey)}
                </span>
                <span
                  className={cn(
                    "text-4xl font-semibold leading-none tracking-tight tabular-nums",
                    isActive
                      ? "text-[#e06737]"
                      : hasValue
                        ? "text-foreground"
                        : "text-muted-foreground/40"
                  )}
                >
                  {stage.value}
                </span>
              </Link>

              {idx < stages.length - 1 ? (
                <span
                  className="flex shrink-0 items-center self-center text-muted-foreground/30"
                  aria-hidden
                >
                  <ChevronRight className="size-5" />
                </span>
              ) : null}
            </li>
          );
        })}
      </ol>

      {insight ? (
        <p className="mt-4 flex items-center gap-2 rounded-lg border border-[#e06737]/20 bg-[#fff4ee] px-3 py-2 text-sm text-[#b4501f] dark:border-[#e06737]/25 dark:bg-[#e06737]/10 dark:text-[#f0a883]">
          <span className="size-1.5 shrink-0 rounded-full bg-[#e06737]" aria-hidden />
          {t("dashboard.ops.flow.insight")}
        </p>
      ) : null}
    </section>
  );
}
