"use client";

import { useMemo } from "react";
import { FolderKanban, FileText, Users, AlertCircle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { useI18n } from "@/i18n/I18nContext";
import { CompanyLogo } from "@/components/branding/CompanyLogo";
import {
  getGreetingKey,
  isOrgTrialing,
  isSetupDashboardMode,
} from "@/lib/dashboardCommandCenter";
import { useCompanyOrgContext } from "./useCompanyOrgContext";
import type { ActiveWorkspace } from "@/types/workspace";
import type { DashboardStats } from "@/lib/dashboardStats";
import type { EnabledModulesMap } from "@/lib/enabledModules";
import { isModuleEnabled } from "@/lib/enabledModules";

type CommandCenterHeroProps = {
  activeWorkspace: ActiveWorkspace;
  firstName: string;
  stats: DashboardStats;
  statsLoading: boolean;
  modules: EnabledModulesMap;
};

type StatusCard = {
  key: string;
  label: string;
  value: string;
  accent?: boolean;
  icon: typeof FolderKanban;
};

export function CommandCenterHero({
  activeWorkspace,
  firstName,
  stats,
  statsLoading,
  modules,
}: CommandCenterHeroProps) {
  const { t } = useI18n();
  const orgId = activeWorkspace.orgId ?? activeWorkspace.id;
  const { org, profile, loading: orgLoading } = useCompanyOrgContext(orgId);

  const companyName =
    profile?.legalName?.trim() ||
    activeWorkspace.name?.trim() ||
    t("dashboard.hero.companyFallback");
  const greetingKey = getGreetingKey(new Date().getHours());
  const setupMode = isSetupDashboardMode(org, stats);
  const isTrial = isOrgTrialing(org);

  const showQuotes = isModuleEnabled(modules, "quotes");
  const showTeam = isModuleEnabled(modules, "team");

  const statusCards = useMemo((): StatusCard[] => {
    if (setupMode || statsLoading) return [];

    const cards: StatusCard[] = [];

    if (stats.activeJobsCount > 0) {
      cards.push({
        key: "active-jobs",
        icon: FolderKanban,
        label: t("dashboard.command.status.activeJobs"),
        value: String(stats.activeJobsCount),
      });
    }

    if (showQuotes && stats.quotesAwaitingCount > 0) {
      cards.push({
        key: "open-offers",
        icon: FileText,
        label: t("dashboard.command.status.openOffers"),
        value: String(stats.quotesAwaitingCount),
        accent: true,
      });
    }

    if (showTeam && stats.teamCount !== null && stats.teamCount > 0) {
      cards.push({
        key: "team",
        icon: Users,
        label: t("dashboard.command.status.team"),
        value: String(stats.teamCount),
      });
    }

    if (stats.delayedJobsCount > 0) {
      cards.push({
        key: "attention",
        icon: AlertCircle,
        label: t("dashboard.command.status.needAttention"),
        value: String(stats.delayedJobsCount),
        accent: true,
      });
    }

    return cards;
  }, [setupMode, statsLoading, stats, showQuotes, showTeam, t]);

  return (
    <header className="space-y-6">
      <div className="flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex min-w-0 items-start gap-4">
          <CompanyLogo
            logoUrl={profile?.logoUrl}
            alt={companyName}
            size="hero"
            className="hidden shrink-0 sm:flex"
          />
          <div className="min-w-0 space-y-2">
            <p className="text-sm text-muted-foreground">
              {t(`dashboard.hero.greeting.${greetingKey}`, { name: firstName })}
            </p>
            <h1 className="text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
              {companyName}
            </h1>
            <div className="flex flex-wrap items-center gap-2">
              {isTrial ? (
                <Badge variant="secondary" className="font-normal">
                  {t("dashboard.command.trialActive")}
                </Badge>
              ) : org && !orgLoading ? (
                <Badge variant="outline" className="font-normal border-border/60">
                  {t("dashboard.hero.badge.activeCompany")}
                </Badge>
              ) : null}
            </div>
          </div>
        </div>
      </div>

      {!setupMode && statusCards.length > 0 ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {statusCards.map((card) => {
            const Icon = card.icon;
            return (
              <div
                key={card.key}
                className={cn(
                  "rounded-2xl px-5 py-4 transition-colors",
                  card.accent
                    ? "bg-[#e06737]/[0.08] ring-1 ring-[#e06737]/15"
                    : "bg-muted/40 ring-1 ring-border/50"
                )}
              >
                <div className="flex items-center gap-2 text-muted-foreground">
                  <Icon className="size-4 shrink-0" aria-hidden />
                  <span className="text-xs font-medium uppercase tracking-wide">
                    {card.label}
                  </span>
                </div>
                <p className="mt-2 text-3xl font-semibold tabular-nums tracking-tight text-foreground">
                  {card.value}
                </p>
              </div>
            );
          })}
        </div>
      ) : null}

      {setupMode ? (
        <p className="max-w-xl text-sm leading-relaxed text-muted-foreground">
          {t("dashboard.command.setupHint")}
        </p>
      ) : null}
    </header>
  );
}

export function CommandCenterHeroSkeleton() {
  return (
    <div className="space-y-6 animate-pulse">
      <div className="space-y-3">
        <div className="h-4 w-32 rounded bg-muted" />
        <div className="h-9 w-64 max-w-full rounded bg-muted" />
        <div className="h-6 w-28 rounded-full bg-muted" />
      </div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="h-24 rounded-2xl bg-muted/60" />
        ))}
      </div>
    </div>
  );
}
