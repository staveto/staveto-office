"use client";

import {
  ClipboardList,
  HardHat,
  Receipt,
  Target,
  TrendingUp,
  Users,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import type { ProjectDoc } from "@/lib/projects";
import {
  computeQuoteSummary,
  computeTaskProgressStats,
  formatMoney,
  getHumanWorkflowStatusKey,
  getNextStepKey,
  type QuoteSummary,
} from "@/lib/projectDashboard";
import type { TaskDoc } from "@/lib/projects";
import type { QuoteDraftItemDoc } from "@/lib/quoteDraftItems";
import { useI18n } from "@/i18n/I18nContext";
import { getAssignedMemberCount } from "@/lib/projectOwnership";
import { normalizeProjectPhase } from "@/lib/projectLifecycle";
import { cn } from "@/lib/utils";

type ProjectKpiCardsProps = {
  project: ProjectDoc;
  tasks: TaskDoc[];
  quoteItems: QuoteDraftItemDoc[];
  quoteSummary?: QuoteSummary;
};

function KpiCard({
  icon: Icon,
  label,
  value,
  highlight,
  className,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
  highlight?: boolean;
  className?: string;
}) {
  return (
    <Card className={cn("border-border/70 shadow-sm", className)}>
      <CardContent className="p-4 space-y-2">
        <div className="flex items-center gap-2 text-muted-foreground">
          <Icon className="size-4 shrink-0" aria-hidden />
          <span className="text-xs font-medium uppercase tracking-wide">{label}</span>
        </div>
        <p
          className={cn(
            "text-base font-semibold leading-snug",
            highlight ? "text-[#e06737]" : "text-[#1D376A]"
          )}
        >
          {value}
        </p>
      </CardContent>
    </Card>
  );
}

export function ProjectKpiCards({
  project,
  tasks,
  quoteItems,
  quoteSummary: quoteSummaryProp,
}: ProjectKpiCardsProps) {
  const { t } = useI18n();
  const quoteSummary = quoteSummaryProp ?? computeQuoteSummary(project, quoteItems, tasks);
  const progress = computeTaskProgressStats(tasks);
  const phase = normalizeProjectPhase(project);
  const statusKey = getHumanWorkflowStatusKey(project);
  const statusLabel = t(`projects.workflow.status.${statusKey}`);
  const nextStep = t(getNextStepKey(project));

  const quoteValue =
    quoteSummary.grossTotal != null && quoteSummary.hasQuote
      ? formatMoney(quoteSummary.grossTotal)
      : t("projects.dashboard.kpi.noQuote");

  const workValue =
    quoteSummary.workHours != null && quoteSummary.workHours > 0
      ? t("projects.dashboard.kpi.workHours", { hours: String(quoteSummary.workHours) })
      : t("projects.dashboard.kpi.workNotPlanned");

  const assigned = getAssignedMemberCount(project);
  const teamValue =
    assigned > 0
      ? t("projects.ownership.assignedCount", { count: assigned })
      : t("projects.dashboard.kpi.noTeam");

  const progressValue =
    phase === "delivery"
      ? progress.total > 0
        ? t("projects.dashboard.kpi.tasksDone", {
            done: String(progress.done),
            total: String(progress.total),
          })
        : t("projects.dashboard.kpi.progressZero")
      : t("projects.dashboard.kpi.progressZero");

  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-6">
      <KpiCard icon={Target} label={t("projects.dashboard.kpi.status")} value={statusLabel} />
      <KpiCard
        icon={ClipboardList}
        label={t("projects.dashboard.kpi.nextStep")}
        value={nextStep}
        highlight
      />
      <KpiCard
        icon={Receipt}
        label={t("projects.dashboard.kpi.quoteValue")}
        value={quoteValue}
      />
      <KpiCard icon={HardHat} label={t("projects.dashboard.kpi.work")} value={workValue} />
      <KpiCard icon={Users} label={t("projects.dashboard.kpi.team")} value={teamValue} />
      <KpiCard icon={TrendingUp} label={t("projects.dashboard.kpi.progress")} value={progressValue} />
    </div>
  );
}
