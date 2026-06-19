"use client";

import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { useI18n } from "@/i18n/I18nContext";
import { cn } from "@/lib/utils";
import { buttonVariants } from "@/components/ui/button";

type OpsStatusStripProps = {
  tone: "calm" | "attention";
  labelKey: string;
  messageKey: string;
  messageParams?: Record<string, number | string>;
  ctaHref: string;
  ctaLabelKey: string;
};

export function OpsStatusStrip({
  tone,
  labelKey,
  messageKey,
  messageParams,
  ctaHref,
  ctaLabelKey,
}: OpsStatusStripProps) {
  const { t } = useI18n();
  const attention = tone === "attention";

  return (
    <section
      className={cn(
        "flex min-h-[56px] items-center gap-3 rounded-xl border bg-card px-4 py-2.5",
        attention
          ? "border-amber-200/80 dark:border-amber-500/25"
          : "border-border dark:border-white/10 dark:bg-[#1e293b]"
      )}
      aria-label={t("dashboard.ops.status.label")}
    >
      <span
        className={cn(
          "size-2 shrink-0 rounded-full",
          attention ? "bg-[#e06737]" : "bg-emerald-500"
        )}
        aria-hidden
      />
      <div className="flex min-w-0 flex-1 flex-wrap items-baseline gap-x-2 gap-y-0.5">
        <span className="text-sm font-semibold text-foreground">{t(labelKey)}</span>
        <span className="min-w-0 text-sm text-muted-foreground">
          {t(messageKey, messageParams)}
        </span>
      </div>
      <Link
        href={ctaHref}
        className={cn(
          buttonVariants({ variant: attention ? "default" : "outline", size: "sm" }),
          "shrink-0"
        )}
      >
        {t(ctaLabelKey)}
        <ArrowRight className="size-3.5" aria-hidden />
      </Link>
    </section>
  );
}
