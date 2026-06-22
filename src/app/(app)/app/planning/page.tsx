"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { RefreshCw, Loader2, GanttChartSquare, CalendarPlus, ShieldAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useI18n } from "@/i18n/I18nContext";
import { useAuth } from "@/context/AuthContext";
import { useWorkspace } from "@/context/WorkspaceContext";
import { useWorkspaceProduct } from "@/hooks/useWorkspaceProduct";
import { isCompanyWorkspaceType } from "@/types/workspace";
import { getPlanningDashboardData, type PlanningDashboardData } from "@/services/planning";
import { buildPlanningCommandCenter } from "@/lib/planningCommandCenter";
import {
  fetchSharedFieldNotesForDashboard,
  canViewOrgSharedFieldNotes,
} from "@/services/operations/fieldNotesService";
import { PersonalPlanningPlaceholder } from "@/components/planning/PersonalPlanningPlaceholder";
import {
  StatusStrip,
  PriorityPanel,
  NextActions,
  TeamCapacityPanel,
  JobsToPlanPanel,
  UnplannedWorkPanel,
  FieldUpdatesCard,
} from "@/components/planning/CommandCenter";

export default function PlanningPage() {
  const { t } = useI18n();
  const { user } = useAuth();
  const { activeWorkspace } = useWorkspace();
  const { isCompany, canManage, role } = useWorkspaceProduct();
  const [data, setData] = useState<PlanningDashboardData | null>(null);
  const [fieldNotesCount, setFieldNotesCount] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (
      !user?.id ||
      !activeWorkspace ||
      !isCompanyWorkspaceType(activeWorkspace.type) ||
      !canManage
    ) {
      setLoading(false);
      setData(null);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const result = await getPlanningDashboardData(activeWorkspace, user.id);
      setData(result);
      if (result && canViewOrgSharedFieldNotes(role)) {
        fetchSharedFieldNotesForDashboard(result.orgId)
          .then((notes) => setFieldNotesCount(notes.length))
          .catch(() => setFieldNotesCount(null));
      } else {
        setFieldNotesCount(null);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : t("planning.loadError"));
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [user?.id, activeWorkspace, canManage, role, t]);

  useEffect(() => {
    void load();
  }, [load]);

  const model = useMemo(
    () => (data ? buildPlanningCommandCenter(data, { fieldNotesCount }) : null),
    [data, fieldNotesCount]
  );

  if (!isCompany) {
    return <PersonalPlanningPlaceholder />;
  }

  if (!canManage) {
    return (
      <div className="mx-auto mt-6 max-w-lg rounded-xl border border-border bg-card p-6 text-center">
        <ShieldAlert className="mx-auto mb-3 size-8 text-muted-foreground" aria-hidden />
        <p className="text-sm font-medium text-foreground">{t("planning.restrictedTitle")}</p>
        <p className="mt-1 text-sm text-muted-foreground">{t("planning.restrictedDesc")}</p>
        <Link
          href="/app/projects"
          className="mt-4 inline-flex h-9 items-center justify-center rounded-md bg-[#1D376A] px-4 text-sm font-medium text-white hover:bg-[#162d58]"
        >
          {t("planning.openMyProjects")}
        </Link>
      </div>
    );
  }

  const hasActiveJobs = (data?.stats.activeJobCount ?? 0) > 0;
  const attendanceConnected = data?.timeEntriesStatus === "available";

  return (
    <div className="mx-auto max-w-[96rem] space-y-4 pb-10">
      {/* Row 1 — header + primary actions */}
      <header className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">
            {t("planning.commandCenter.title")}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {t("planning.commandCenter.subtitle")}
          </p>
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-2">
          <Link
            href="/app/planning/gantt"
            className="inline-flex h-9 items-center gap-2 rounded-md bg-[#e06737] px-4 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-[#c8552a]"
          >
            <GanttChartSquare className="size-4" aria-hidden />
            {t("planning.openGantt")}
          </Link>
          <Link
            href="/app/planning/gantt?view=week"
            className="inline-flex h-9 items-center gap-2 rounded-md border border-border bg-background px-3 text-sm font-medium text-foreground hover:border-[#e06737]/60"
          >
            <CalendarPlus className="size-4" aria-hidden />
            {t("planning.planWork")}
          </Link>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => void load()}
            disabled={loading}
            className="h-9 shrink-0"
          >
            {loading ? (
              <Loader2 className="size-4 animate-spin" aria-hidden />
            ) : (
              <RefreshCw className="size-4" aria-hidden />
            )}
            <span className="ml-2">{t("planning.refresh")}</span>
          </Button>
        </div>
      </header>

      {error ? (
        <p className="rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
          {error}
        </p>
      ) : null}

      {loading && !model ? (
        <div className="flex items-center justify-center py-24">
          <Loader2
            className="size-8 animate-spin text-[#1D376A]/50"
            aria-label={t("i18n.aria.loading")}
          />
        </div>
      ) : model && data ? (
        <>
          {/* Row 2 — compact status strip */}
          <StatusStrip model={model} t={t} />

          {/* Row 3 — what needs planning (2/3) + today summary (1/3) */}
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
            <div className="lg:col-span-2">
              <PriorityPanel model={model} hasActiveJobs={hasActiveJobs} t={t} />
            </div>
            <NextActions model={model} t={t} />
          </div>

          {/* Row 4 — team capacity + jobs requiring planning */}
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <TeamCapacityPanel model={model} attendanceConnected={attendanceConnected} t={t} />
            <JobsToPlanPanel
              jobs={model.jobsRequiringPlanning}
              hasActiveJobs={hasActiveJobs}
              t={t}
            />
          </div>

          {/* Row 5 — unplanned work full width */}
          <UnplannedWorkPanel model={model} t={t} />

          {/* Row 6 — field updates */}
          <FieldUpdatesCard data={data} fieldNotesCount={fieldNotesCount} t={t} />
        </>
      ) : null}
    </div>
  );
}
