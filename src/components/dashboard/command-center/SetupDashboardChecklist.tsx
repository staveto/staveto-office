"use client";

import Link from "next/link";
import { ArrowRight, Check, Circle } from "lucide-react";
import { cn } from "@/lib/utils";
import { buttonVariants } from "@/components/ui/button";
import { useI18n } from "@/i18n/I18nContext";
import type { CompanyType } from "@/lib/onboardingTypes";
import {
  buildSetupChecklist,
  getFirstIncompleteSetupItem,
  getSetupCompletedMessageKey,
  getSetupEstimatedTimeKey,
  getSetupItemHintKey,
  getSetupItemLabelKey,
  getSetupProgress,
  type SetupChecklistItem,
} from "@/lib/dashboardCommandCenter";
import type { DashboardStats } from "@/lib/dashboardStats";
import type { OrganizationProfile } from "@/lib/organizationProfile";
import type { EnabledModulesMap } from "@/lib/enabledModules";

type SetupDashboardChecklistProps = {
  stats: DashboardStats;
  profile: OrganizationProfile | null;
  modules: EnabledModulesMap;
  companyType: CompanyType;
};

type ChecklistRowProps = {
  item: SetupChecklistItem;
  label: string;
  hint: string;
  completedMessage: string;
  isRecommended: boolean;
};

function ChecklistRow({
  item,
  label,
  hint,
  completedMessage,
  isRecommended,
}: ChecklistRowProps) {
  if (item.completed) {
    return (
      <div
        className={cn(
          "flex gap-3 rounded-xl px-4 py-3.5",
          "bg-emerald-500/[0.06] ring-1 ring-emerald-500/15"
        )}
      >
        <Check className="size-5 shrink-0 text-emerald-600" aria-hidden />
        <div className="min-w-0 flex-1 space-y-0.5">
          <p className="text-sm font-medium text-muted-foreground line-through">{label}</p>
          <p className="text-xs font-medium text-emerald-700">{completedMessage}</p>
        </div>
      </div>
    );
  }

  return (
    <Link
      href={item.href}
      className={cn(
        "group block cursor-pointer rounded-xl outline-none",
        "transition-colors focus-visible:ring-2 focus-visible:ring-[#e06737]/40"
      )}
    >
      <div
        className={cn(
          "flex gap-3 rounded-xl px-4 py-3.5 ring-1 transition-all",
          isRecommended
            ? "border-l-[3px] border-l-[#e06737] bg-[#e06737]/[0.07] ring-[#e06737]/20 pl-[calc(1rem-3px)]"
            : "border-l-[3px] border-l-transparent bg-background ring-border/60",
          "hover:bg-muted/40 hover:ring-[#1D376A]/20"
        )}
      >
        <Circle
          className={cn(
            "size-5 shrink-0 transition-colors",
            isRecommended ? "text-[#e06737]" : "text-muted-foreground/45",
            "group-hover:text-[#1D376A]/70"
          )}
          aria-hidden
        />
        <div className="min-w-0 flex-1 space-y-0.5">
          <p className="text-sm font-medium text-foreground group-hover:text-[#1D376A]">
            {label}
          </p>
          <p className="text-xs leading-relaxed text-muted-foreground">{hint}</p>
        </div>
        <ArrowRight
          className={cn(
            "size-4 shrink-0 self-center opacity-0 transition-opacity",
            "text-muted-foreground group-hover:opacity-100"
          )}
          aria-hidden
        />
      </div>
    </Link>
  );
}

export function SetupDashboardChecklist({
  stats,
  profile,
  modules,
  companyType,
}: SetupDashboardChecklistProps) {
  const { t } = useI18n();
  const items = buildSetupChecklist(stats, profile, modules, companyType);
  const progress = getSetupProgress(items);
  const firstIncomplete = getFirstIncompleteSetupItem(items);

  return (
    <section className="space-y-5 rounded-2xl bg-gradient-to-br from-[#1D376A]/[0.05] to-transparent p-6 ring-1 ring-[#1D376A]/10">
      <div className="space-y-3">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold tracking-tight text-[#1D376A]">
              {t("dashboard.command.setup.title")}
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              {t("dashboard.command.setup.subtitle")}
            </p>
          </div>
          <p className="text-sm font-medium tabular-nums text-[#1D376A]">
            {t("dashboard.command.setup.progress", {
              completed: progress.completed,
              total: progress.total,
            })}
          </p>
        </div>
        <div className="h-1.5 overflow-hidden rounded-full bg-[#1D376A]/10">
          <div
            className="h-full rounded-full bg-[#e06737] transition-all duration-500"
            style={{ width: `${progress.percent}%` }}
            role="progressbar"
            aria-valuenow={progress.percent}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label={t("dashboard.command.setup.title")}
          />
        </div>
      </div>

      {firstIncomplete ? (
        <div className="rounded-xl border border-[#e06737]/25 bg-[#e06737]/[0.06] p-4 sm:p-5">
          <p className="text-xs font-medium uppercase tracking-wide text-[#e06737]">
            {t("dashboard.command.setup.recommended.label")}
          </p>
          <p className="mt-1.5 text-base font-semibold text-[#1D376A]">
            {t(getSetupItemLabelKey(firstIncomplete.id, companyType))}
          </p>
          <p className="mt-1 text-sm text-muted-foreground">
            {t("dashboard.command.setup.recommended.time", {
              time: t(getSetupEstimatedTimeKey(firstIncomplete.id)),
            })}
          </p>
          <Link
            href={firstIncomplete.href}
            className={cn(
              buttonVariants({ size: "sm" }),
              "mt-4 inline-flex bg-[#e06737] text-white hover:bg-[#e06737]/90"
            )}
          >
            {t("dashboard.command.setup.recommended.start")}
            <ArrowRight className="size-3.5" data-icon="inline-end" />
          </Link>
        </div>
      ) : null}

      <ul className="space-y-2" role="list">
        {items.map((item) => {
          const isRecommended = firstIncomplete?.id === item.id;
          return (
            <li key={item.id}>
              <ChecklistRow
                item={item}
                label={t(getSetupItemLabelKey(item.id, companyType))}
                hint={t(getSetupItemHintKey(item.id, companyType))}
                completedMessage={t(getSetupCompletedMessageKey(item.id))}
                isRecommended={isRecommended}
              />
            </li>
          );
        })}
      </ul>
    </section>
  );
}
