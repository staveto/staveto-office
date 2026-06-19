"use client";

import Link from "next/link";
import { CheckCircle2 } from "lucide-react";
import { useI18n } from "@/i18n/I18nContext";
import { cn } from "@/lib/utils";
import { buttonVariants } from "@/components/ui/button";
import type { OpsAction } from "./opsModel";
import { opsCardClassName, opsPriorityDotClassName } from "./opsStyles";

type NextStepsCardProps = {
  actions: OpsAction[];
};

export function NextStepsCard({ actions }: NextStepsCardProps) {
  const { t } = useI18n();

  return (
    <section className={cn(opsCardClassName, "p-5")}>
      <h2 className="mb-3 text-base font-semibold tracking-tight text-foreground">
        {t("dashboard.ops.nextSteps.title")}
      </h2>

      {actions.length === 0 ? (
        <div className="flex items-center gap-3 rounded-lg bg-muted/40 px-3 py-3">
          <CheckCircle2 className="size-5 shrink-0 text-emerald-600 dark:text-emerald-400" aria-hidden />
          <p className="text-sm text-muted-foreground">{t("dashboard.ops.nextSteps.empty")}</p>
        </div>
      ) : (
        <ul className="divide-y divide-border dark:divide-white/10" role="list">
          {actions.map((action) => (
            <li
              key={action.id}
              className="flex items-center justify-between gap-3 py-2.5 first:pt-0 last:pb-0"
            >
              <div className="flex min-w-0 items-start gap-2.5">
                <span
                  className={cn("mt-1.5 size-2 shrink-0 rounded-full", opsPriorityDotClassName[action.priority])}
                  aria-hidden
                />
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-foreground">
                    {t(action.titleKey, action.titleParams)}
                  </p>
                  <p className="truncate text-xs text-muted-foreground">{t(action.descKey)}</p>
                </div>
              </div>
              <Link
                href={action.href}
                className={cn(buttonVariants({ variant: "outline", size: "sm" }), "shrink-0")}
              >
                {t(action.actionLabelKey)}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
