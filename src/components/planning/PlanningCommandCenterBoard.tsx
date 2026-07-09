"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Loader2, RefreshCw, GanttChartSquare, CalendarPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useI18n } from "@/i18n/I18nContext";
import { useAuth } from "@/context/AuthContext";
import { useWorkspace } from "@/context/WorkspaceContext";
import { useWorkspaceProduct } from "@/hooks/useWorkspaceProduct";
import { isCompanyWorkspaceType } from "@/types/workspace";
import {
  buildPlanningOverviewMetrics,
  buildProjectCardSummaries,
} from "@/lib/planningSummaryMetrics";
import { fetchGanttPlanningData } from "@/services/planning/ganttPlanningService";
import { PlanningActionCards } from "./PlanningActionCards";
import { ProjectPlanningBelt } from "./ProjectPlanningBelt";
import { PlanningCapacityCompact } from "./PlanningCapacityCompact";
import styles from "./gantt.module.css";

type PlanningCommandCenterBoardProps = {
  ganttBasePath?: string;
  showHeader?: boolean;
};

export function PlanningCommandCenterBoard({
  ganttBasePath = "/app/planning/gantt",
  showHeader = false,
}: PlanningCommandCenterBoardProps) {
  const { t } = useI18n();
  const { user } = useAuth();
  const { activeWorkspace } = useWorkspace();
  const { role } = useWorkspaceProduct();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [projects, setProjects] = useState<ReturnType<typeof buildProjectCardSummaries>>([]);
  const [metrics, setMetrics] = useState<ReturnType<typeof buildPlanningOverviewMetrics> | null>(
    null
  );

  const load = useCallback(async () => {
    if (!user?.id || !activeWorkspace || !isCompanyWorkspaceType(activeWorkspace.type)) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const data = await fetchGanttPlanningData(activeWorkspace, user.id, role);
      setProjects(buildProjectCardSummaries(data.projects));
      setMetrics(
        buildPlanningOverviewMetrics({
          projects: data.projects,
          tasksByProject: data.tasksByProject,
        })
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : t("planning.empty.loadFailed"));
    } finally {
      setLoading(false);
    }
  }, [user?.id, activeWorkspace, role, t]);

  useEffect(() => {
    void load();
  }, [load]);

  const beltProjects = useMemo(() => projects, [projects]);

  if (loading && !metrics) {
    return (
      <div className="flex justify-center py-16">
        <Loader2 className="size-8 animate-spin text-[#1D376A]" />
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {showHeader ? (
        <header className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-foreground">
              {t("planning.commandCenter.title")}
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
              {t("planning.commandCenter.subtitle")}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link
              href={ganttBasePath}
              className="inline-flex h-9 items-center gap-2 rounded-md bg-[#e06737] px-4 text-sm font-semibold text-white hover:bg-[#c8552a]"
            >
              <GanttChartSquare className="size-4" />
              {t("planning.openGantt")}
            </Link>
            <Link
              href={`${ganttBasePath}?showAll=1`}
              className="inline-flex h-9 items-center gap-2 rounded-md border border-border px-3 text-sm font-medium hover:border-[#e06737]/50"
            >
              <CalendarPlus className="size-4" />
              {t("planning.planWork")}
            </Link>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-9"
              onClick={() => void load()}
              disabled={loading}
            >
              {loading ? <Loader2 className="size-4 animate-spin" /> : <RefreshCw className="size-4" />}
              <span className="ml-2">{t("planning.refresh")}</span>
            </Button>
          </div>
        </header>
      ) : null}

      {error ? (
        <p className="rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
          {error}
        </p>
      ) : null}

      {metrics ? (
        <>
          <PlanningActionCards metrics={metrics} t={t} />
          <ProjectPlanningBelt
            projects={beltProjects}
            selectedProjectId="all"
            ganttBasePath={ganttBasePath}
            t={t}
          />
          <PlanningCapacityCompact metrics={metrics} t={t} />
          {beltProjects.length === 0 ? (
            <div className={styles.planningEmptyPanel}>
              <p className={styles.planningEmptyTitle}>{t("planning.empty.noActiveProjects")}</p>
            </div>
          ) : null}
        </>
      ) : null}
    </div>
  );
}
