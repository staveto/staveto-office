"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useI18n } from "@/i18n/I18nContext";
import {
  formatEur,
  formatMinutesWithUnits,
} from "@/services/attendance/attendanceAggregations";

type AttendanceKpiCardProps = {
  totalMinutes: number;
  meMinutes: number;
  teamMinutes: number;
  labourCostEur?: number;
  canSeeTeam: boolean;
};

export function AttendanceKpiCard({
  totalMinutes,
  meMinutes,
  teamMinutes,
  labourCostEur,
  canSeeTeam,
}: AttendanceKpiCardProps) {
  const { t } = useI18n();
  const fmt = (mins: number) =>
    formatMinutesWithUnits(mins, t("time.hoursShort"), t("time.minutesShort"));

  return (
    <Card className="border-[#1D376A]/20 bg-gradient-to-br from-[#1D376A]/5 to-transparent">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">
          {t("attendance.totalSum")}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <p className="text-3xl font-semibold tabular-nums">{fmt(totalMinutes)}</p>
        {labourCostEur != null && labourCostEur > 0 && (
          <p className="mt-1 text-sm text-muted-foreground">
            {t("attendance.labourCost")}: {formatEur(labourCostEur)}
          </p>
        )}
        {canSeeTeam && (
          <p className="mt-2 text-sm text-muted-foreground">
            {t("attendance.me")} {fmt(meMinutes)} • {t("attendance.team")} {fmt(teamMinutes)}
          </p>
        )}
      </CardContent>
    </Card>
  );
}
