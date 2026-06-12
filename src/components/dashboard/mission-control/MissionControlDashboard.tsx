"use client";

import Link from "next/link";
import { Loader2 } from "lucide-react";
import { useI18n } from "@/i18n/I18nContext";
import { useWorkspaceProduct } from "@/hooks/useWorkspaceProduct";
import { useTeamLiveStatus } from "@/hooks/useTeamLiveStatus";
import { getGreetingKey } from "@/lib/dashboardCommandCenter";
import type { MissionControlData } from "@/lib/missionControlData";
import type { ActiveWorkspace } from "@/types/workspace";
import { TeamLiveStatusPanel } from "@/components/operations/TeamLiveStatusPanel";
import { MissionControlAttention } from "./MissionControlAttention";
import { MissionControlKpis } from "./MissionControlKpis";
import { MissionControlToday } from "./MissionControlToday";
import { MissionControlCalendar } from "./MissionControlCalendar";
import { MissionControlTeam } from "./MissionControlTeam";
import { MissionControlWorkload } from "./MissionControlWorkload";
import { MissionControlVehicles } from "./MissionControlVehicles";
import { missionMutedClassName } from "./missionControlStyles";
import { cn } from "@/lib/utils";

type MissionControlDashboardProps = {
  data: MissionControlData | null;
  loading: boolean;
  displayName: string;
  orgName?: string;
  workspace?: ActiveWorkspace | null;
  uid?: string;
};

function formatHeaderDate(): string {
  return new Date().toLocaleDateString(undefined, {
    weekday: "long",
    day: "numeric",
    month: "long",
  });
}

export function MissionControlDashboard({
  data,
  loading,
  displayName,
  orgName,
  workspace,
  uid,
}: MissionControlDashboardProps) {
  const { t } = useI18n();
  const { isOwner, canManage, role } = useWorkspaceProduct();
  const { activeWorkers } = useTeamLiveStatus(workspace, uid, role);
  const showFinance = isOwner || role === "accountant";

  if (loading || !data) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <Loader2 className="size-8 animate-spin text-primary" aria-label={t("common.loading")} />
      </div>
    );
  }

  const greetingKey = getGreetingKey(new Date().getHours());

  const coreKpis = data.kpis.filter((k) =>
    ["active-projects", "workers-today", "open-tasks", "absences-today", "unassigned-tasks", "no-tools-tasks"].includes(
      k.id
    )
  );

  const financeKpis = showFinance
    ? [
        ...(data.stats.quotesAwaitingCount > 0
          ? [
              {
                id: "quotes-awaiting",
                labelKey: "dashboard.mission.kpi.quotesAwaiting",
                value: data.stats.quotesAwaitingCount,
                href: "/app/quotes",
              },
            ]
          : []),
      ]
    : [];

  const allKpis = [...coreKpis, ...financeKpis];

  return (
    <div className="mx-auto max-w-6xl space-y-4 pb-10 md:space-y-5">
      <header className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-sm text-muted-foreground">
            {t(`dashboard.hero.greeting.${greetingKey}`, { name: displayName })}
          </p>
          <h1 className="mt-0.5 text-xl font-semibold tracking-tight text-foreground md:text-2xl">
            {orgName ?? data.planning.orgName}
          </h1>
        </div>
        <p className={cn(missionMutedClassName, "text-xs sm:text-right")}>{formatHeaderDate()}</p>
      </header>

      <MissionControlToday rows={data.todayRows} />

      {canManage && data.attention.length > 0 ? (
        <MissionControlAttention items={data.attention} />
      ) : null}

      {canManage ? (
        <>
          <MissionControlKpis kpis={allKpis} />

          <div className="grid gap-4 lg:grid-cols-5">
            <div className="lg:col-span-3">
              <MissionControlCalendar
                monthDays={data.monthDays}
                daysWithEvents={data.daysWithEvents}
                todayIso={data.todayIso}
                agendaGroups={data.agendaGroups}
              />
            </div>
            <div className="space-y-4 lg:col-span-2">
              {activeWorkers.length > 0 ? (
                <div className="space-y-2">
                  <TeamLiveStatusPanel members={activeWorkers} t={t} />
                  <Link
                    href="/app/operations"
                    className="text-xs font-medium text-primary hover:underline"
                  >
                    {t("operations.title")} →
                  </Link>
                </div>
              ) : null}
              <MissionControlTeam team={data.team} />
              <MissionControlWorkload workloads={data.workloads} />
              <MissionControlVehicles vehicles={data.vehicles} />
            </div>
          </div>
        </>
      ) : (
        <div className="rounded-xl border border-border bg-white p-6 text-center dark:bg-[#1e293b]">
          <p className={missionMutedClassName}>{t("dashboard.mission.limitedRole")}</p>
          <Link
            href="/app/planning"
            className="mt-2 inline-block text-sm font-medium text-primary hover:underline"
          >
            {t("dashboard.mission.today.viewPlanning")}
          </Link>
        </div>
      )}
    </div>
  );
}
