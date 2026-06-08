import type { TimeEntryDoc } from "./timeTrackingReadService";
import type { MemberRatesMap } from "./timeTrackingReadService";

export type ProjectAttendanceSummary = {
  projectId: string;
  projectName: string;
  totalMinutes: number;
  meMinutes: number;
  teamMinutes: number;
  labourCostEur?: number;
};

export type PersonProjectBreakdown = {
  projectId: string;
  projectName: string;
  minutes: number;
  labourCostEur?: number;
};

export type PersonAttendanceSummary = {
  userId: string;
  userName: string;
  totalMinutes: number;
  totalLabourCostEur?: number;
  byProject: PersonProjectBreakdown[];
};

export function computeLabourCostEur(minutes: number, hourlyRate: number | undefined): number {
  if (hourlyRate == null || hourlyRate <= 0 || minutes <= 0) return 0;
  return Math.round((minutes / 60) * hourlyRate * 100) / 100;
}

export function formatMinutesWithUnits(minutes: number, hLabel: string, minLabel: string): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${h} ${hLabel} ${String(m).padStart(2, "0")} ${minLabel}`;
}

export function formatEur(amount: number): string {
  return new Intl.NumberFormat("de-DE", {
    style: "currency",
    currency: "EUR",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);
}

function getRate(ratesMap: MemberRatesMap, projectId: string, userId: string): number | undefined {
  return ratesMap.get(projectId)?.get(userId);
}

export function summarizeByProject(
  entries: TimeEntryDoc[],
  viewerUserId: string,
  ratesMap: MemberRatesMap
): ProjectAttendanceSummary[] {
  const map = new Map<
    string,
    { projectName: string; totalMinutes: number; meMinutes: number; teamMinutes: number; labourCostEur: number }
  >();

  for (const e of entries) {
    const key = e.projectId;
    if (!key) continue;
    const mins = e.durationMinutes ?? 0;
    const isMe = e.userId === viewerUserId;
    const cost = computeLabourCostEur(mins, getRate(ratesMap, key, e.userId));
    const existing = map.get(key);
    if (existing) {
      existing.totalMinutes += mins;
      existing.labourCostEur += cost;
      if (isMe) existing.meMinutes += mins;
      else existing.teamMinutes += mins;
    } else {
      map.set(key, {
        projectName: e.projectNameSnapshot?.trim() || key,
        totalMinutes: mins,
        meMinutes: isMe ? mins : 0,
        teamMinutes: isMe ? 0 : mins,
        labourCostEur: cost,
      });
    }
  }

  return Array.from(map.entries())
    .map(([projectId, row]) => ({
      projectId,
      projectName: row.projectName,
      totalMinutes: row.totalMinutes,
      meMinutes: row.meMinutes,
      teamMinutes: row.teamMinutes,
      labourCostEur: row.labourCostEur > 0 ? Math.round(row.labourCostEur * 100) / 100 : undefined,
    }))
    .sort((a, b) => b.totalMinutes - a.totalMinutes);
}

export function summarizeByPerson(
  entries: TimeEntryDoc[],
  ratesMap: MemberRatesMap
): PersonAttendanceSummary[] {
  const map = new Map<
    string,
    {
      userName: string;
      totalMinutes: number;
      totalLabourCostEur: number;
      byProject: Map<string, { projectName: string; minutes: number; labourCostEur: number }>;
    }
  >();

  for (const e of entries) {
    const uid = e.userId || "unknown";
    const mins = e.durationMinutes ?? 0;
    const name = e.userNameSnapshot?.trim() || uid;
    const cost = computeLabourCostEur(mins, getRate(ratesMap, e.projectId, uid));
    const existing = map.get(uid);
    if (existing) {
      existing.totalMinutes += mins;
      existing.totalLabourCostEur += cost;
      const proj = existing.byProject.get(e.projectId);
      if (proj) {
        proj.minutes += mins;
        proj.labourCostEur += cost;
      } else {
        existing.byProject.set(e.projectId, {
          projectName: e.projectNameSnapshot?.trim() || e.projectId,
          minutes: mins,
          labourCostEur: cost,
        });
      }
    } else {
      const byProject = new Map<string, { projectName: string; minutes: number; labourCostEur: number }>();
      byProject.set(e.projectId, {
        projectName: e.projectNameSnapshot?.trim() || e.projectId,
        minutes: mins,
        labourCostEur: cost,
      });
      map.set(uid, { userName: name, totalMinutes: mins, totalLabourCostEur: cost, byProject });
    }
  }

  return Array.from(map.entries())
    .map(([userId, row]) => ({
      userId,
      userName: row.userName,
      totalMinutes: row.totalMinutes,
      totalLabourCostEur:
        row.totalLabourCostEur > 0 ? Math.round(row.totalLabourCostEur * 100) / 100 : undefined,
      byProject: Array.from(row.byProject.entries())
        .map(([projectId, p]) => ({
          projectId,
          projectName: p.projectName,
          minutes: p.minutes,
          labourCostEur: p.labourCostEur > 0 ? Math.round(p.labourCostEur * 100) / 100 : undefined,
        }))
        .sort((a, b) => b.minutes - a.minutes),
    }))
    .sort((a, b) => a.userName.localeCompare(b.userName, undefined, { sensitivity: "base" }));
}

export function computeGrandTotals(
  entries: TimeEntryDoc[],
  viewerUserId: string
): { totalMinutes: number; meMinutes: number; teamMinutes: number } {
  let meMinutes = 0;
  let teamMinutes = 0;
  for (const e of entries) {
    const mins = e.durationMinutes ?? 0;
    if (e.userId === viewerUserId) meMinutes += mins;
    else teamMinutes += mins;
  }
  return { totalMinutes: meMinutes + teamMinutes, meMinutes, teamMinutes };
}

export function computeGrandLabourCost(projectSummaries: ProjectAttendanceSummary[]): number | undefined {
  const sum = projectSummaries.reduce((acc, p) => acc + (p.labourCostEur ?? 0), 0);
  return sum > 0 ? Math.round(sum * 100) / 100 : undefined;
}
