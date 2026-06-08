"use client";

import { Fragment, useState } from "react";
import Link from "next/link";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useI18n } from "@/i18n/I18nContext";
import {
  formatEur,
  formatMinutesWithUnits,
  type PersonAttendanceSummary,
} from "@/services/attendance/attendanceAggregations";
import { ChevronDown, ChevronRight } from "lucide-react";

type AttendanceByPersonTableProps = {
  rows: PersonAttendanceSummary[];
  viewerUserId: string;
};

export function AttendanceByPersonTable({ rows, viewerUserId }: AttendanceByPersonTableProps) {
  const { t } = useI18n();
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const fmt = (mins: number) =>
    formatMinutesWithUnits(mins, t("time.hoursShort"), t("time.minutesShort"));

  const toggle = (userId: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(userId)) next.delete(userId);
      else next.add(userId);
      return next;
    });
  };

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
            <TableHead className="w-[40px]" />
            <TableHead>{t("attendance.colPerson")}</TableHead>
            <TableHead className="text-right">{t("attendance.totalHours")}</TableHead>
            <TableHead className="text-right hidden sm:table-cell">{t("attendance.labourCost")}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((person) => {
            const isOpen = expanded.has(person.userId);
            const isMe = person.userId === viewerUserId;
            return (
              <Fragment key={person.userId}>
                <TableRow className="cursor-pointer hover:bg-muted/40" onClick={() => toggle(person.userId)}>
                  <TableCell>
                    <Button type="button" variant="ghost" size="icon" className="size-7" tabIndex={-1}>
                      {isOpen ? <ChevronDown className="size-4" /> : <ChevronRight className="size-4" />}
                    </Button>
                  </TableCell>
                  <TableCell className="font-medium">
                    {person.userName}
                    {isMe && (
                      <Badge variant="secondary" className="ml-2">
                        {t("attendance.meBadge")}
                      </Badge>
                    )}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{fmt(person.totalMinutes)}</TableCell>
                  <TableCell className="text-right tabular-nums hidden sm:table-cell">
                    {person.totalLabourCostEur != null ? formatEur(person.totalLabourCostEur) : "—"}
                  </TableCell>
                </TableRow>
                {isOpen &&
                  person.byProject.map((proj) => (
                    <TableRow key={`${person.userId}-${proj.projectId}`} className="bg-muted/20">
                      <TableCell />
                      <TableCell className="pl-8 text-sm text-muted-foreground">
                        <Link href={`/app/projects/${proj.projectId}`} className="hover:underline text-[#1D376A]">
                          {proj.projectName}
                        </Link>
                      </TableCell>
                      <TableCell className="text-right tabular-nums text-sm">{fmt(proj.minutes)}</TableCell>
                      <TableCell className="text-right tabular-nums text-sm hidden sm:table-cell">
                        {proj.labourCostEur != null ? formatEur(proj.labourCostEur) : "—"}
                      </TableCell>
                    </TableRow>
                  ))}
              </Fragment>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}
