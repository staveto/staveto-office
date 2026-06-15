"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { useWorkspace } from "@/context/WorkspaceContext";
import { useWorkspaceProduct } from "@/hooks/useWorkspaceProduct";
import { useI18n } from "@/i18n/I18nContext";
import { useTeamLiveStatus } from "@/hooks/useTeamLiveStatus";
import { canViewWorkDayReport } from "@/lib/operationsPermissions";
import type { WorkDayReport } from "@/lib/workDayReport";
import {
  fetchWorkDayReport,
  formatWorkDayLabel,
  shiftDateYmd,
  workDayReportHref,
} from "@/services/operations/workDayReportService";
import {
  WorkDayHeaderActions,
  WorkDaySummaryCards,
} from "@/components/operations/WorkDaySummaryCards";
import { WorkDayTimeline } from "@/components/operations/WorkDayTimeline";
import { WorkDayMovementMap } from "@/components/operations/WorkDayMovementMap";
import { WorkDayTasksCard } from "@/components/operations/WorkDayTasksCard";
import { WorkDayProblemsCard } from "@/components/operations/WorkDayProblemsCard";
import { WorkDayPhotosStrip } from "@/components/operations/WorkDayPhotosStrip";
import { WorkDaySummaryChecklist } from "@/components/operations/WorkDaySummaryChecklist";
import { WorkDayEmployeeNotes } from "@/components/operations/WorkDayEmployeeNotes";
import { WorkDayMaterialsCard } from "@/components/operations/WorkDayMaterialsCard";
import { cn } from "@/lib/utils";
import styles from "./workDay.module.css";

type Props = {
  userId: string;
  dateYmd: string;
};

export function WorkDayDetailPage({ userId, dateYmd }: Props) {
  const { t, locale } = useI18n();
  const router = useRouter();
  const { user } = useAuth();
  const { activeWorkspace } = useWorkspace();
  const { role } = useWorkspaceProduct();
  const { teamStatus } = useTeamLiveStatus(activeWorkspace, user?.id, role);

  const [report, setReport] = useState<WorkDayReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!user?.id || !activeWorkspace) return;
    if (!canViewWorkDayReport(user.id, userId, role)) {
      setError(t("workDay.error.permission"));
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const data = await fetchWorkDayReport({
        workspace: activeWorkspace,
        viewerUid: user.id,
        role,
        targetUserId: userId,
        dateYmd,
        teamStatus,
      });
      setReport(data);
    } catch (e) {
      const msg = e instanceof Error ? e.message : t("workDay.error.load");
      setError(msg === "permission-denied" ? t("workDay.error.permission") : msg);
      setReport(null);
    } finally {
      setLoading(false);
    }
  }, [activeWorkspace, user?.id, userId, dateYmd, role, teamStatus, t]);

  useEffect(() => {
    void load();
  }, [load]);

  const dateLabel = formatWorkDayLabel(dateYmd, locale);
  const navigateDay = (delta: number) => {
    router.push(workDayReportHref(userId, shiftDateYmd(dateYmd, delta)));
  };

  if (loading) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <Loader2 className="size-8 animate-spin text-[#1D376A]" aria-label={t("common.loading")} />
      </div>
    );
  }

  if (error || !report) {
    return (
      <div className="mx-auto max-w-lg rounded-xl border border-border bg-card p-6 text-center">
        <p className="text-sm text-muted-foreground">{error ?? t("workDay.error.load")}</p>
        <Link href="/app/operations" className="mt-3 inline-block text-sm font-medium text-primary hover:underline">
          {t("workDay.breadcrumb.operations")}
        </Link>
      </div>
    );
  }

  return (
    <div className={styles.page}>
      <nav className="mb-2 text-sm text-muted-foreground" aria-label={t("workDay.breadcrumb.label")}>
        <Link href="/app/operations" className="hover:text-[#1D376A] hover:underline">
          {t("workDay.breadcrumb.reports")}
        </Link>
        <span className="mx-2">›</span>
        <span>{report.employee.name}</span>
        <span className="mx-2">›</span>
        <span className="text-foreground">{dateLabel}</span>
      </nav>

      <header className="mb-6 space-y-4">
        <h1 className="text-2xl font-extrabold tracking-tight text-[#1D376A]">
          {t("workDay.title")}
        </h1>
        <WorkDayHeaderActions
          t={t}
          dateLabel={dateLabel}
          onPrev={() => navigateDay(-1)}
          onNext={() => navigateDay(1)}
        />
      </header>

      <div className="space-y-4">
        <WorkDaySummaryCards report={report} t={t} />

        <div className={styles.mainGrid}>
          <div className={styles.colTimeline}>
            <WorkDayTimeline items={report.timeline} t={t} />
          </div>
          <div className={styles.colMap}>
            <WorkDayMovementMap
              points={report.gpsPoints}
              distanceKm={report.distanceKm}
              stopCount={report.stopCount}
              locationLabel={report.locationLabel}
              gpsStatus={report.gpsStatus}
              t={t}
            />
          </div>
          <div className={cn(styles.colSide, "space-y-4")}>
            <WorkDayTasksCard tasks={report.tasks} t={t} />
            <WorkDayProblemsCard problems={report.problems} t={t} />
          </div>

          <div className={styles.colPhotos}>
            <WorkDayPhotosStrip photos={report.photos} t={t} />
          </div>
          <div className={styles.colSummary}>
            <WorkDaySummaryChecklist report={report} t={t} />
          </div>

          <div className={styles.colNotes}>
            <WorkDayEmployeeNotes notes={report.employeeNotes} t={t} />
          </div>
          <div className={styles.colMaterials}>
            <WorkDayMaterialsCard materials={report.materials} t={t} />
          </div>
        </div>
      </div>
    </div>
  );
}
