"use client";

import Link from "next/link";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useI18n } from "@/i18n/I18nContext";
import {
  formatEur,
  formatMinutesWithUnits,
  type ProjectAttendanceSummary,
} from "@/services/attendance/attendanceAggregations";

type AttendanceByProjectTableProps = {
  rows: ProjectAttendanceSummary[];
  showTeamColumns: boolean;
};

export function AttendanceByProjectTable({ rows, showTeamColumns }: AttendanceByProjectTableProps) {
  const { t } = useI18n();

  const fmt = (mins: number) =>
    formatMinutesWithUnits(mins, t("time.hoursShort"), t("time.minutesShort"));

  if (rows.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-border py-12 text-center text-muted-foreground">
        {t("attendance.empty")}
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-border overflow-hidden">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>{t("attendance.colProject")}</TableHead>
            <TableHead className="text-right">{t("attendance.projectTotal")}</TableHead>
            {showTeamColumns && (
              <>
                <TableHead className="text-right hidden md:table-cell">{t("attendance.me")}</TableHead>
                <TableHead className="text-right hidden md:table-cell">{t("attendance.team")}</TableHead>
              </>
            )}
            <TableHead className="text-right hidden sm:table-cell">{t("attendance.labourCost")}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((row) => (
            <TableRow key={row.projectId}>
              <TableCell className="font-medium">
                <Link href={`/app/projects/${row.projectId}`} className="hover:underline text-[#1D376A]">
                  {row.projectName}
                </Link>
              </TableCell>
              <TableCell className="text-right tabular-nums">{fmt(row.totalMinutes)}</TableCell>
              {showTeamColumns && (
                <>
                  <TableCell className="text-right tabular-nums hidden md:table-cell">
                    {fmt(row.meMinutes)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums hidden md:table-cell">
                    {fmt(row.teamMinutes)}
                  </TableCell>
                </>
              )}
              <TableCell className="text-right tabular-nums hidden sm:table-cell">
                {row.labourCostEur != null ? formatEur(row.labourCostEur) : "—"}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
