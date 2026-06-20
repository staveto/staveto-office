"use client";

import Link from "next/link";
import { useMemo } from "react";
import { ArrowRight, CalendarPlus, FilePlus2, Loader2 } from "lucide-react";
import { useI18n } from "@/i18n/I18nContext";
import { useWorkspaceProduct } from "@/hooks/useWorkspaceProduct";
import type { MissionControlData } from "@/lib/missionControlData";
import type { ActiveWorkspace } from "@/types/workspace";
import { cn } from "@/lib/utils";
import { buttonVariants } from "@/components/ui/button";
import { buildOpsView } from "./opsModel";
import { OpsStatusStrip } from "./OpsStatusStrip";
import { WorkOverviewBoard } from "./WorkOverviewBoard";
import { TodayPanel } from "./TodayPanel";
import { NextStepsCard } from "./NextStepsCard";
import { CapacityCard } from "./CapacityCard";
import { OpsFinance } from "./OpsFinance";
import { OpsFieldProof } from "./OpsFieldProof";

type MissionControlDashboardProps = {
  data: MissionControlData | null;
  loading: boolean;
  displayName: string;
  orgName?: string;
  workspace?: ActiveWorkspace | null;
  uid?: string;
};

function formatHeaderDate(locale: string): string {
  return new Date().toLocaleDateString(locale, {
    weekday: "long",
    day: "numeric",
    month: "long",
  });
}

export function MissionControlDashboard({
  data,
  loading,
  orgName,
}: MissionControlDashboardProps) {
  const { t, locale } = useI18n();
  const { isOwner, canManage, role } = useWorkspaceProduct();
  const showFinance = isOwner || role === "accountant";

  const view = useMemo(
    () => (data ? buildOpsView(data, { showFinance }) : null),
    [data, showFinance]
  );

  if (loading || !data || !view) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <Loader2 className="size-8 animate-spin text-primary" aria-label={t("common.loading")} />
      </div>
    );
  }

  const company = orgName ?? data.planning.orgName;
  const quotesNeedAction = showFinance && data.stats.quotesAwaitingCount > 0;
  const primaryCtaHref = quotesNeedAction ? "/app/quotes" : "/app/planning";
  const primaryCtaLabel = quotesNeedAction
    ? "dashboard.ops.status.reviewQuotes"
    : "dashboard.ops.status.planWork";

  // Compact one-line status summary from the workflow chips.
  const summaryChips = view.statusChips.filter((c) => {
    if (c.id === "absences") return (view.capacity.absences ?? 0) > 0;
    return true;
  });

  const header = (
    <header className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
      <div className="min-w-0">
        <h1 className="truncate text-2xl font-semibold tracking-tight text-foreground">
          {company}
        </h1>
        <p className="mt-1 flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-sm text-muted-foreground">
          <span className="font-medium text-foreground/70">{t("dashboard.ops.todayLabel")}</span>
          {summaryChips.map((chip, i) => (
            <span key={chip.id} className="flex items-center gap-1.5">
              {i > 0 ? <span aria-hidden className="text-muted-foreground/40">·</span> : null}
              <span>{t(chip.labelKey, chip.params)}</span>
            </span>
          ))}
        </p>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        <span className="hidden text-xs text-muted-foreground sm:mr-1 sm:inline">
          {formatHeaderDate(locale)}
        </span>
        {canManage ? (
          <>
            <Link href="/app/planning" className={cn(buttonVariants({ variant: "outline", size: "sm" }))}>
              <CalendarPlus className="size-3.5" aria-hidden />
              {t("dashboard.ops.header.planWork")}
            </Link>
            <Link href="/app/projects/new" className={cn(buttonVariants({ size: "sm" }))}>
              <FilePlus2 className="size-3.5" aria-hidden />
              {t("dashboard.ops.header.newJob")}
            </Link>
          </>
        ) : null}
      </div>
    </header>
  );

  if (!canManage) {
    return (
      <div className="mx-auto w-full max-w-[1440px] space-y-5 pb-10">
        {header}
        <WorkOverviewBoard
          stages={view.workflow}
          insight={view.workflowInsight}
          ctaHref={primaryCtaHref}
          ctaLabelKey="dashboard.ops.flow.cta"
          showCta={false}
        />
        <div className="rounded-xl border border-border bg-card p-6 text-center dark:border-white/10 dark:bg-[#1e293b]">
          <p className="text-sm text-muted-foreground">{t("dashboard.mission.limitedRole")}</p>
          <Link
            href="/app/planning"
            className="mt-2 inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline"
          >
            {t("dashboard.ops.today.actionPlan")}
            <ArrowRight className="size-3.5" aria-hidden />
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-[1440px] space-y-5 pb-10">
      {header}

      <OpsStatusStrip
        tone={view.statusTone}
        labelKey={view.statusLabelKey}
        messageKey={view.statusMessageKey}
        messageParams={view.statusMessageParams}
        ctaHref={primaryCtaHref}
        ctaLabelKey={primaryCtaLabel}
      />

      {/* Main grid: work overview (left) + today (right), next steps below.
          Desktop keeps the two-column layout; on mobile the Today panel
          stacks first (order-1) before the work overview + next steps. */}
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-12">
        <div className="order-2 space-y-5 lg:order-1 lg:col-span-8">
          <WorkOverviewBoard
            stages={view.workflow}
            insight={view.workflowInsight}
            ctaHref={primaryCtaHref}
            ctaLabelKey="dashboard.ops.flow.cta"
            showCta={quotesNeedAction}
          />
          <NextStepsCard actions={view.nextActions} />
        </div>

        <div className="order-1 lg:order-2 lg:col-span-4">
          <TodayPanel capacity={view.capacity} showFinance={showFinance} />
        </div>
      </div>

      {/* Bottom row: Capacity / Finance / Field proof */}
      <div
        className={cn(
          "grid grid-cols-1 gap-5 md:grid-cols-2",
          showFinance ? "lg:grid-cols-3" : "lg:grid-cols-2"
        )}
      >
        <CapacityCard
          team={view.team}
          vehicles={view.vehicles}
          workersAvailable={view.capacity.workersAvailable}
          vehiclesAvailable={view.capacity.vehiclesAvailable}
        />
        {showFinance ? <OpsFinance rows={view.finance} /> : null}
        <OpsFieldProof
          photos={data.fieldProof.photos}
          docs={data.fieldProof.docs}
          openProblems={data.fieldProof.openProblems}
        />
      </div>
    </div>
  );
}
