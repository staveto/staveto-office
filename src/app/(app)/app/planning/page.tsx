"use client";

import { useCallback, useEffect, useState } from "react";
import {
  Users,
  FolderKanban,
  UserCheck,
  Palmtree,
  ListTodo,
  Clock,
  RefreshCw,
  Loader2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useI18n } from "@/i18n/I18nContext";
import { useAuth } from "@/context/AuthContext";
import { useWorkspace } from "@/context/WorkspaceContext";
import { useWorkspaceProduct } from "@/hooks/useWorkspaceProduct";
import { isCompanyWorkspaceType } from "@/types/workspace";
import { getPlanningDashboardData, type PlanningDashboardData, type PlanningTaskItem } from "@/services/planning";
import { PlanningPageHeader } from "@/components/planning/PlanningPageHeader";
import { PlanningSummaryCard } from "@/components/planning/PlanningSummaryCard";
import { PlanningTabs, type PlanningTabId } from "@/components/planning/PlanningTabs";
import { TodayPlanningPanel } from "@/components/planning/TodayPlanningPanel";
import { PlanningWeekCalendar } from "@/components/planning/PlanningWeekCalendar";
import { MonthPlanningGrid } from "@/components/planning/MonthPlanningGrid";
import { TeamPlanningPanel } from "@/components/planning/TeamPlanningPanel";
import { PersonalPlanningPlaceholder } from "@/components/planning/PersonalPlanningPlaceholder";
import styles from "@/components/planning/planning.module.css";

export default function PlanningPage() {
  const { t } = useI18n();
  const { user } = useAuth();
  const { activeWorkspace } = useWorkspace();
  const { isCompany, companyName } = useWorkspaceProduct();
  const [activeTab, setActiveTab] = useState<PlanningTabId>("today");
  const [data, setData] = useState<PlanningDashboardData | null>(null);
  const [tasks, setTasks] = useState<PlanningTaskItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!user?.id || !activeWorkspace || !isCompanyWorkspaceType(activeWorkspace.type)) {
      setLoading(false);
      setData(null);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const result = await getPlanningDashboardData(activeWorkspace, user.id);
      setData(result);
      setTasks(result?.allTasksWithDueDate ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : t("planning.loadError"));
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [user?.id, activeWorkspace, t]);

  useEffect(() => {
    void load();
  }, [load]);

  if (!isCompany) {
    return <PersonalPlanningPlaceholder />;
  }

  return (
    <div className={`mx-auto max-w-[90rem] space-y-5 pb-8 ${styles.planningShell}`}>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <PlanningPageHeader companyName={companyName} isPersonalWorkspace={false} />
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => void load()}
          disabled={loading}
          className="shrink-0"
        >
          {loading ? (
            <Loader2 className="size-4 animate-spin" aria-hidden />
          ) : (
            <RefreshCw className="size-4" aria-hidden />
          )}
          <span className="ml-2">{t("planning.refresh")}</span>
        </Button>
      </div>

      {error ? (
        <p className="rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
          {error}
        </p>
      ) : null}

      <section aria-label={t("planning.summary.ariaLabel")} className={styles.summaryGrid}>
        <PlanningSummaryCard
          title={t("planning.summary.team")}
          value={data?.stats.teamMemberCount ?? null}
          loading={loading}
          icon={Users}
        />
        <PlanningSummaryCard
          title={t("planning.summary.activeJobs")}
          value={data?.stats.activeJobCount ?? null}
          loading={loading}
          icon={FolderKanban}
        />
        <PlanningSummaryCard
          title={t("planning.summary.assignedWorkers")}
          value={data?.stats.assignedWorkerCount ?? null}
          loading={loading}
          icon={UserCheck}
        />
        <PlanningSummaryCard
          title={t("planning.summary.absencesToday")}
          value={data?.stats.absencesTodayCount ?? null}
          loading={loading}
          comingSoon={data?.absencesStatus === "unavailable"}
          icon={Palmtree}
        />
        <PlanningSummaryCard
          title={t("planning.summary.tasksDue")}
          value={data?.stats.tasksWithDueDateCount ?? null}
          loading={loading}
          icon={ListTodo}
        />
        <PlanningSummaryCard
          title={t("planning.summary.missingAttendance")}
          value={data?.stats.missingAttendanceCount ?? null}
          loading={loading}
          comingSoon={data?.timeEntriesStatus === "unavailable"}
          icon={Clock}
        />
      </section>

      <PlanningTabs activeTab={activeTab} onTabChange={setActiveTab} />

      {loading && !data ? (
        <div className="flex items-center justify-center py-16">
          <Loader2
            className="size-8 animate-spin text-[#1D376A]/50"
            aria-label={t("i18n.aria.loading")}
          />
        </div>
      ) : data ? (
        <>
          {activeTab === "today" ? <TodayPlanningPanel data={data} /> : null}
          {activeTab === "week" ? (
            <PlanningWeekCalendar
              data={data}
              tasks={tasks}
              onTasksChange={setTasks}
            />
          ) : null}
          {activeTab === "month" ? <MonthPlanningGrid data={data} /> : null}
          {activeTab === "team" ? <TeamPlanningPanel data={data} /> : null}
        </>
      ) : null}
    </div>
  );
}
