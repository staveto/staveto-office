"use client";

import type { LucideIcon } from "lucide-react";
import {
  Users,
  UserCheck,
  UserPlus,
  Shield,
  Briefcase,
  HardHat,
  Mail,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useI18n } from "@/i18n/I18nContext";
import type { OrganizationSeatFields } from "@/lib/companyRoles";
import {
  countTeamRole,
  countActiveTeamSeats,
  resolveOrganizationSeatLimit,
  resolveSeatsUsed,
  type CompanyTeamMemberRow,
} from "@/lib/companyRoles";

type TeamOverviewHeroProps = {
  organization: OrganizationSeatFields;
  teamRows: CompanyTeamMemberRow[];
  pendingInvites: number;
  seatsFull: boolean;
};

type StatCard = {
  key: string;
  label: string;
  value: string | number;
  icon: LucideIcon;
  accent?: boolean;
};

function StatCardView({ card }: { card: StatCard }) {
  const Icon = card.icon;
  return (
    <div
      className={cn(
        "rounded-2xl px-4 py-3.5 ring-1",
        card.accent
          ? "bg-[#e06737]/[0.07] ring-[#e06737]/20"
          : "bg-muted/30 ring-border/50"
      )}
    >
      <div className="flex items-center gap-2 text-muted-foreground">
        <Icon className="size-4 shrink-0" aria-hidden />
        <span className="text-xs font-medium">{card.label}</span>
      </div>
      <p className="mt-2 text-2xl font-semibold tabular-nums tracking-tight">{card.value}</p>
    </div>
  );
}

export function TeamOverviewHero({
  organization,
  teamRows,
  pendingInvites,
  seatsFull,
}: TeamOverviewHeroProps) {
  const { t } = useI18n();

  const seatLimit = resolveOrganizationSeatLimit(organization);
  const seatsUsed = resolveSeatsUsed(organization, teamRows, pendingInvites);
  const seatsAvailable = Math.max(0, seatLimit - seatsUsed);

  const stats: StatCard[] = [
    {
      key: "total",
      label: t("members.overview.totalMembers"),
      value: countActiveTeamSeats(teamRows),
      icon: Users,
    },
    {
      key: "seats",
      label: t("members.overview.usedSeats"),
      value: `${seatsUsed} / ${seatLimit}`,
      icon: UserCheck,
      accent: seatsFull,
    },
    {
      key: "available",
      label: t("members.overview.availableSeats"),
      value: seatsAvailable,
      icon: UserPlus,
    },
  ];

  if (pendingInvites > 0) {
    stats.push({
      key: "pending",
      label: t("members.overview.pendingInvites"),
      value: pendingInvites,
      icon: Mail,
    });
  }

  const roleStats: StatCard[] = [
    {
      key: "owners-admins",
      label: t("members.overview.ownersAdmins"),
      value:
        countTeamRole(teamRows, "owner") +
        countTeamRole(teamRows, "admin"),
      icon: Shield,
    },
    {
      key: "managers",
      label: t("members.overview.managers"),
      value: countTeamRole(teamRows, "manager"),
      icon: Briefcase,
    },
    {
      key: "workers",
      label: t("members.overview.workers"),
      value:
        countTeamRole(teamRows, "worker") + countTeamRole(teamRows, "viewer"),
      icon: HardHat,
    },
  ];

  return (
    <section className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-[#1D376A]">
          {t("members.overview.title")}
        </h1>
        <p className="mt-1 max-w-2xl text-sm leading-relaxed text-muted-foreground">
          {t("members.overview.subtitle")}
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {stats.map((card) => (
          <StatCardView key={card.key} card={card} />
        ))}
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        {roleStats.map((card) => (
          <StatCardView key={card.key} card={card} />
        ))}
      </div>

      {seatsFull ? (
        <div
          className="rounded-xl border border-[#e06737]/30 bg-[#e06737]/[0.06] px-4 py-3 text-sm text-[#1D376A]"
          role="alert"
        >
          {t("members.seatsFullWarning")}
        </div>
      ) : null}
    </section>
  );
}
