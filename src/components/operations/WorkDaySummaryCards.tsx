"use client";

import Link from "next/link";
import {
  ChevronLeft,
  ChevronRight,
  Clock,
  FileDown,
  MapPin,
  Pencil,
  User,
} from "lucide-react";
import type { WorkDayReport } from "@/lib/workDayReport";
import { memberInitials, toHoursMinutes } from "@/lib/operationsMetrics";
import { cn } from "@/lib/utils";
import styles from "./workDay.module.css";

type Props = {
  report: WorkDayReport;
  t: (key: string, params?: Record<string, string | number>) => string;
};

export function WorkDaySummaryCards({ report, t }: Props) {
  const expected = report.expectedMinutes;
  const progress =
    expected != null && expected > 0
      ? Math.min(100, Math.round((report.totalMinutes / expected) * 100))
      : report.totalMinutes > 0
        ? 100
        : 0;
  const project = report.primaryProject;

  return (
    <div className={styles.summaryGrid}>
      <article className={styles.summaryCard}>
        <div className="mb-2 flex items-center gap-2 text-muted-foreground">
          <Clock className="size-4" aria-hidden />
          <span className="text-xs font-semibold uppercase tracking-wide">
            {t("workDay.summary.totalTime")}
          </span>
        </div>
        <p className="text-2xl font-extrabold tabular-nums text-[#1D376A]">
          {toHoursMinutes(report.totalMinutes)}
        </p>
        {report.expectedMinutes != null ? (
          <p className="mt-1 text-xs text-muted-foreground">
            {t("workDay.summary.ofExpected", { expected: toHoursMinutes(report.expectedMinutes) })}
          </p>
        ) : null}
        {report.totalMinutes > 0 ? (
          <div className={cn(styles.progressTrack, "mt-2")}>
            <div
              className={styles.progressFill}
              style={{ width: `${report.expectedMinutes != null ? progress : 100}%` }}
            />
          </div>
        ) : null}
      </article>

      <article className={styles.summaryCard}>
        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          {t("workDay.summary.project")}
        </p>
        {project ? (
          <>
            <Link
              href={`/app/projects/${project.id}`}
              className="text-base font-bold text-[#1D376A] hover:underline"
            >
              {project.name}
            </Link>
            {(project.customerName || project.city) && (
              <p className="mt-1 text-xs text-muted-foreground">
                {[project.customerName, project.city].filter(Boolean).join(" · ")}
              </p>
            )}
          </>
        ) : (
          <p className="text-sm text-muted-foreground">{t("workDay.empty.noProject")}</p>
        )}
      </article>

      <article className={styles.summaryCard}>
        <div className="mb-2 flex items-center gap-2 text-muted-foreground">
          <MapPin className="size-4" aria-hidden />
          <span className="text-xs font-semibold uppercase tracking-wide">
            {t("workDay.summary.location")}
          </span>
        </div>
        {report.locationLabel ? (
          <p className="text-sm font-semibold text-foreground">{report.locationLabel}</p>
        ) : (
          <p className="text-sm text-muted-foreground">{t("workDay.empty.noLocation")}</p>
        )}
        <p className="mt-2 text-xs font-semibold text-muted-foreground">
          {t(`operations.gps.${report.gpsStatus}`)}
        </p>
      </article>

      <article className={styles.summaryCard}>
        <div className="mb-2 flex items-center gap-2 text-muted-foreground">
          <User className="size-4" aria-hidden />
          <span className="text-xs font-semibold uppercase tracking-wide">
            {t("workDay.summary.employee")}
          </span>
        </div>
        <div className="flex items-center gap-3">
          <div className={styles.avatar} aria-hidden>
            {memberInitials(report.employee.name)}
          </div>
          <div className="min-w-0">
            <p className="truncate text-base font-bold">{report.employee.name}</p>
            {report.employee.role ? (
              <p className="text-xs capitalize text-muted-foreground">{report.employee.role}</p>
            ) : null}
            {report.employee.statusToday ? (
              <p className="text-xs font-semibold text-[#1D376A]">
                {t(`operations.status.${report.employee.statusToday}`)}
              </p>
            ) : null}
          </div>
        </div>
      </article>

      <article className={styles.summaryCard}>
        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          {t("workDay.summary.reportStatus")}
        </p>
        {report.reportStatus === "not_approved" ? (
          <span className={styles.badgePending}>{t("workDay.status.notApproved")}</span>
        ) : (
          <span className={styles.badgeApproved}>{t("workDay.status.approved")}</span>
        )}
        {report.approvedBy ? (
          <p className="mt-2 text-xs text-muted-foreground">
            {t("workDay.status.approvedBy", { name: report.approvedBy })}
          </p>
        ) : null}
      </article>
    </div>
  );
}

export function WorkDayHeaderActions({
  t,
  onPrev,
  onNext,
  dateLabel,
}: {
  t: (key: string, params?: Record<string, string | number>) => string;
  onPrev: () => void;
  onNext: () => void;
  dateLabel: string;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={onPrev}
          className="inline-flex size-9 items-center justify-center rounded-lg border border-border bg-card hover:bg-muted"
          aria-label={t("workDay.nav.prevDay")}
        >
          <ChevronLeft className="size-5" />
        </button>
        <p className="min-w-[12rem] text-center text-sm font-semibold">{dateLabel}</p>
        <button
          type="button"
          onClick={onNext}
          className="inline-flex size-9 items-center justify-center rounded-lg border border-border bg-card hover:bg-muted"
          aria-label={t("workDay.nav.nextDay")}
        >
          <ChevronRight className="size-5" />
        </button>
      </div>
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          disabled
          title={t("workDay.actions.exportSoon")}
          className="inline-flex items-center gap-2 rounded-lg border border-[#1D376A] px-3 py-2 text-sm font-semibold text-[#1D376A] opacity-60"
        >
          <FileDown className="size-4" />
          {t("workDay.actions.exportPdf")}
        </button>
        <button
          type="button"
          disabled
          title={t("workDay.actions.editSoon")}
          className="inline-flex items-center gap-2 rounded-lg bg-[#1D376A] px-3 py-2 text-sm font-semibold text-white opacity-60"
        >
          <Pencil className="size-4" />
          {t("workDay.actions.editReport")}
        </button>
      </div>
    </div>
  );
}
