"use client";

import { Circle, Play, UserRound, Users } from "lucide-react";
import type { ProjectOverviewViewModel } from "@/lib/projectOverviewViewModel";
import type { ProjectDashboardTab } from "@/lib/projectDashboard";
import { Button } from "@/components/ui/button";
import { useI18n } from "@/i18n/I18nContext";
import { cn } from "@/lib/utils";
import { po } from "./poStyles";

type Props = {
  team: ProjectOverviewViewModel["team"];
  onNavigate: (tab: ProjectDashboardTab) => void;
};

export function ProjectTeamCard({ team, onNavigate }: Props) {
  const { t } = useI18n();
  const activeCount = team.filter((m) => m.activeNow).length;

  return (
    <section className={cn(po.card, "p-4")}>
      <div className="mb-3 flex items-center justify-between gap-2">
        <h2 className={cn(po.title, "flex items-center gap-2")}>
          <Users className="size-4" aria-hidden />
          {t("projects.crew.title")}
        </h2>
        <Button size="sm" variant="outline" className={po.btnOutline} onClick={() => onNavigate("workplan")}>
          {t("projects.workPlan.assignWorker")}
        </Button>
      </div>

      {team.length === 0 ? (
        <p className={cn(po.body, "rounded-lg border border-dashed border-[var(--po-card-border)] px-3 py-4 text-center")}>
          {t("projects.crew.empty")}
        </p>
      ) : (
        <>
          <p className={cn(po.muted, "mb-2")}>
            {t("projects.crew.summary", { total: team.length, working: activeCount })}
          </p>
          {activeCount === 0 ? (
            <p className="mb-2 text-xs font-medium text-amber-700 dark:text-amber-300">
              {t("projects.command.team.noActiveNow")}
            </p>
          ) : null}
          <ul className="space-y-1.5">
            {team.map((member) => (
              <li
                key={member.id}
                className={cn(
                  po.cardMuted,
                  "flex min-h-11 items-center justify-between gap-2 px-3 py-2"
                )}
              >
                <span className="flex min-w-0 items-center gap-2">
                  <UserRound className="size-4 shrink-0 text-[var(--po-text-muted)]" />
                  <span className={po.bodyStrong}>{member.name}</span>
                </span>
                <span className="flex shrink-0 items-center gap-2">
                  <span className={po.muted}>
                    {t("projects.command.team.taskCount", { count: member.taskCount })}
                  </span>
                  <StatusDot active={member.activeNow} t={t} />
                </span>
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}

function StatusDot({
  active,
  t,
}: {
  active: boolean;
  t: (key: string) => string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-medium",
        active
          ? "border-emerald-500/40 bg-emerald-500/15 text-emerald-800 dark:text-emerald-100"
          : "border-[var(--po-card-border)] bg-[var(--po-card-muted)] text-[var(--po-text-muted)]"
      )}
      title={active ? t("projects.crew.statusWorking") : t("projects.crew.statusIdle")}
    >
      {active ? <Play className="size-2.5" /> : <Circle className="size-2.5" />}
      {active ? t("projects.crew.statusWorking") : t("projects.crew.statusIdle")}
    </span>
  );
}
