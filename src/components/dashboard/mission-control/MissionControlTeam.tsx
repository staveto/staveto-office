"use client";

import type { TeamMemberRow } from "@/lib/missionControlData";
import { useI18n } from "@/i18n/I18nContext";
import {
  missionGlassCardClassName,
  missionMutedClassName,
  missionSectionTitleClassName,
  missionStatusToneClassName,
} from "./missionControlStyles";
import { cn } from "@/lib/utils";

type MissionControlTeamProps = {
  team: TeamMemberRow[];
};

export function MissionControlTeam({ team }: MissionControlTeamProps) {
  const { t } = useI18n();

  return (
    <section className={cn(missionGlassCardClassName, "p-4")}>
      <h3 className={cn(missionSectionTitleClassName, "mb-3")}>
        {t("dashboard.mission.team.title")}
      </h3>
      {team.length === 0 ? (
        <p className={cn(missionMutedClassName, "text-sm")}>{t("dashboard.mission.team.empty")}</p>
      ) : (
        <ul className="divide-y divide-border" role="list">
          {team.map((member) => (
            <li
              key={member.uid}
              className="flex items-center justify-between gap-2 py-2 first:pt-0 last:pb-0"
            >
              <div className="flex min-w-0 items-center gap-2">
                <span
                  className="flex size-7 shrink-0 items-center justify-center rounded-full bg-primary/15 text-xs font-semibold text-primary"
                  aria-hidden
                >
                  {member.name.slice(0, 1).toUpperCase()}
                </span>
                <span className="truncate text-sm font-medium text-foreground">{member.name}</span>
              </div>
              <span
                className={cn(
                  "shrink-0 rounded-md px-2 py-0.5 text-[10px] font-medium",
                  missionStatusToneClassName[member.statusTone]
                )}
              >
                {t(member.statusKey)}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
