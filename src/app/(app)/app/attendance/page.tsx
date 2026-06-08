"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Clock, Loader2, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useI18n } from "@/i18n/I18nContext";
import { useAuth } from "@/context/AuthContext";
import { useWorkspace } from "@/context/WorkspaceContext";
import { useWorkspaceProduct } from "@/hooks/useWorkspaceProduct";
import {
  FirestoreIndexError,
  loadAttendanceForMonth,
  loadMemberRatesForEntries,
  type MemberRatesMap,
} from "@/services/attendance/timeTrackingReadService";
import {
  computeGrandLabourCost,
  computeGrandTotals,
  summarizeByPerson,
  summarizeByProject,
} from "@/services/attendance/attendanceAggregations";
import { AttendanceMonthNav } from "@/components/attendance/AttendanceMonthNav";
import { AttendanceKpiCard } from "@/components/attendance/AttendanceKpiCard";
import { AttendanceByPersonTable } from "@/components/attendance/AttendanceByPersonTable";
import { AttendanceByProjectTable } from "@/components/attendance/AttendanceByProjectTable";
import { cn } from "@/lib/utils";

type TabId = "person" | "project";

export default function AttendancePage() {
  const { t } = useI18n();
  const { user } = useAuth();
  const { activeWorkspace } = useWorkspace();
  const { role, isCompany } = useWorkspaceProduct();

  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [activeTab, setActiveTab] = useState<TabId>("person");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [allEntries, setAllEntries] = useState<Awaited<ReturnType<typeof loadAttendanceForMonth>>["allEntries"]>([]);
  const [canSeeTeam, setCanSeeTeam] = useState(false);
  const [rates, setRates] = useState<MemberRatesMap>(new Map());

  const isFutureMonth =
    year > now.getFullYear() || (year === now.getFullYear() && month > now.getMonth() + 1);

  const load = useCallback(async () => {
    if (!user?.id || !activeWorkspace) {
      setAllEntries([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const result = await loadAttendanceForMonth(activeWorkspace, user.id, role, year, month);
      const ratesMap = await loadMemberRatesForEntries(result.allEntries);
      setAllEntries(result.allEntries);
      setCanSeeTeam(result.canSeeTeam);
      setRates(ratesMap);
    } catch (e) {
      if (e instanceof FirestoreIndexError) {
        setError(e.message);
      } else {
        const err = e as { code?: string; message?: string };
        if (err?.code === "permission-denied") {
          setError(t("attendance.permissionDenied"));
        } else {
          setError(e instanceof Error ? e.message : t("attendance.loadError"));
        }
      }
      setAllEntries([]);
      setRates(new Map());
    } finally {
      setLoading(false);
    }
  }, [user?.id, activeWorkspace, role, year, month, t]);

  useEffect(() => {
    void load();
  }, [load]);

  const viewerUserId = user?.id ?? "";
  const projectSummaries = useMemo(
    () => summarizeByProject(allEntries, viewerUserId, rates),
    [allEntries, viewerUserId, rates]
  );
  const personSummaries = useMemo(
    () => summarizeByPerson(allEntries, rates),
    [allEntries, rates]
  );
  const totals = useMemo(
    () => computeGrandTotals(allEntries, viewerUserId),
    [allEntries, viewerUserId]
  );
  const grandLabourCost = useMemo(
    () => computeGrandLabourCost(projectSummaries),
    [projectSummaries]
  );

  const goPrevMonth = () => {
    if (month === 1) {
      setMonth(12);
      setYear((y) => y - 1);
    } else {
      setMonth((m) => m - 1);
    }
  };

  const goNextMonth = () => {
    if (isFutureMonth) return;
    if (month === 12) {
      setMonth(1);
      setYear((y) => y + 1);
    } else {
      setMonth((m) => m + 1);
    }
  };

  if (!isCompany && activeWorkspace?.type !== "personal") {
    return (
      <div className="rounded-xl border border-dashed border-border py-16 text-center text-muted-foreground">
        {t("attendance.companyOnly")}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold flex items-center gap-2">
            <Clock className="size-6 text-[#1D376A]" />
            {t("attendance.title")}
          </h1>
          <p className="text-muted-foreground mt-1">{t("attendance.subtitle")}</p>
        </div>
        <Button type="button" variant="outline" size="sm" onClick={() => void load()} disabled={loading}>
          <RefreshCw className={`size-4 mr-2 ${loading ? "animate-spin" : ""}`} />
          {t("common.refresh")}
        </Button>
      </div>

      <AttendanceMonthNav
        year={year}
        month={month}
        onPrev={goPrevMonth}
        onNext={goNextMonth}
        disableNext={isFutureMonth}
      />

      {loading && (
        <div className="flex justify-center py-16">
          <Loader2 className="size-8 animate-spin text-muted-foreground" />
        </div>
      )}

      {error && (
        <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-4 text-destructive text-sm">
          {error}
        </div>
      )}

      {!loading && !error && (
        <>
          <AttendanceKpiCard
            totalMinutes={totals.totalMinutes}
            meMinutes={totals.meMinutes}
            teamMinutes={totals.teamMinutes}
            labourCostEur={grandLabourCost}
            canSeeTeam={canSeeTeam}
          />

          <div className="flex gap-2 border-b">
            {(["person", "project"] as TabId[]).map((tab) => (
              <Button
                key={tab}
                type="button"
                variant={activeTab === tab ? "secondary" : "ghost"}
                size="sm"
                onClick={() => setActiveTab(tab)}
                className={cn(
                  activeTab === tab && "border-b-2 border-[#1D376A] rounded-b-none"
                )}
              >
                {tab === "person" ? t("attendance.byPerson") : t("attendance.byProject")}
              </Button>
            ))}
          </div>

          {activeTab === "person" && (
            <AttendanceByPersonTable rows={personSummaries} viewerUserId={viewerUserId} />
          )}

          {activeTab === "project" && (
            <div className="space-y-2">
              {canSeeTeam && (
                <p className="text-sm text-muted-foreground">{t("attendance.byProjectHint")}</p>
              )}
              <AttendanceByProjectTable rows={projectSummaries} showTeamColumns={canSeeTeam} />
            </div>
          )}
        </>
      )}
    </div>
  );
}
