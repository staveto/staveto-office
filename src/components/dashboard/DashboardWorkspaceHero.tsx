"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  Building2,
  Users,
  FolderKanban,
  Settings,
  UserPlus,
  FileText,
  Plus,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useI18n } from "@/i18n/I18nContext";
import { useAuth } from "@/context/AuthContext";
import { useWorkspace } from "@/context/WorkspaceContext";
import type { ActiveWorkspace } from "@/types/workspace";
import { isCompanyWorkspaceType } from "@/types/workspace";
import {
  getOrganization,
  isOrgMemberActive,
  listOrgMembers,
  type Organization,
} from "@/lib/organizations";
import { readOrganizationProfile, type OrganizationProfile } from "@/lib/organizationProfile";
import { CompanyLogo } from "@/components/branding/CompanyLogo";
import { BUSINESS_CREATE_ROUTE } from "@/services/onboarding";
import { useEnabledModules } from "@/context/EnabledModulesContext";
import { isModuleEnabled } from "@/lib/enabledModules";

export type DashboardWorkspaceHeroProps = {
  activeWorkspace: ActiveWorkspace;
  firstName: string;
  projectsCount: number | null;
  estimatesCount: number | null;
  statsLoading?: boolean;
};

function parseTrialEnd(raw: unknown): Date | null {
  if (!raw) return null;
  if (typeof raw === "string") {
    const d = new Date(raw);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  if (typeof raw === "object" && raw !== null && "toDate" in raw) {
    return (raw as { toDate: () => Date }).toDate();
  }
  return null;
}

function getGreetingKey(hour: number): "morning" | "day" | "evening" {
  if (hour < 12) return "morning";
  if (hour < 18) return "day";
  return "evening";
}

type CompanyHeroData = {
  org: Organization | null;
  profile: OrganizationProfile | null;
  teamCount: number | null;
  loading: boolean;
};

function useCompanyHeroData(orgId: string | undefined): CompanyHeroData {
  const [org, setOrg] = useState<Organization | null>(null);
  const [profile, setProfile] = useState<OrganizationProfile | null>(null);
  const [teamCount, setTeamCount] = useState<number | null>(null);
  const [loading, setLoading] = useState(!!orgId);

  useEffect(() => {
    if (!orgId) {
      setOrg(null);
      setProfile(null);
      setTeamCount(null);
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);

    void (async () => {
      try {
        const [orgDoc, orgProfile, members] = await Promise.all([
          getOrganization(orgId),
          readOrganizationProfile(orgId),
          listOrgMembers(orgId),
        ]);
        if (cancelled) return;
        setOrg(orgDoc);
        setProfile(orgProfile?.profile ?? null);
        const active = members.filter((m) => isOrgMemberActive(m)).length;
        setTeamCount(active);
      } catch {
        if (!cancelled) {
          setOrg(null);
          setProfile(null);
          setTeamCount(null);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [orgId]);

  return { org, profile, teamCount, loading };
}

function HeroBadge({
  children,
  variant = "outline",
  className,
}: {
  children: React.ReactNode;
  variant?: "outline" | "secondary" | "default";
  className?: string;
}) {
  return (
    <Badge
      variant={variant}
      className={cn(
        "text-xs font-medium",
        variant === "outline" && "border-[#1D376A]/25 bg-white/70 text-[#1D376A]",
        className
      )}
    >
      {children}
    </Badge>
  );
}

function CompanyHeroCard({
  activeWorkspace,
  firstName,
  projectsCount,
  estimatesCount,
  statsLoading,
}: DashboardWorkspaceHeroProps) {
  const { t } = useI18n();
  const { modules } = useEnabledModules();
  const showQuotes = isModuleEnabled(modules, "quotes");
  const showTeam = isModuleEnabled(modules, "team");
  const { org, profile, teamCount, loading: orgLoading } = useCompanyHeroData(activeWorkspace.orgId);
  const [nowMs] = useState(() => Date.now());

  const companyName =
    profile?.legalName?.trim() ||
    activeWorkspace.name?.trim() ||
    t("dashboard.hero.companyFallback");
  const logoUrl = profile?.logoUrl;
  const greetingKey = getGreetingKey(new Date().getHours());

  const trialEnd = parseTrialEnd(org?.trialEndsAt);
  const isTrial = trialEnd ? trialEnd.getTime() > nowMs : false;

  const statusBadges = useMemo(() => {
    const items: { key: string; label: string; variant?: "outline" | "secondary" }[] = [
      { key: "workspace", label: t("dashboard.hero.badge.companyWorkspace") },
      { key: "business", label: t("dashboard.hero.badge.business") },
    ];
    if (isTrial) {
      items.push({
        key: "trial",
        label: t("dashboard.hero.badge.trial"),
        variant: "secondary",
      });
    } else if (org) {
      items.push({
        key: "active",
        label: t("dashboard.hero.badge.activeCompany"),
        variant: "secondary",
      });
    }
    return items;
  }, [isTrial, org, t]);

  const identityFacts = useMemo(() => {
    const facts: { icon: typeof Building2; text: string }[] = [];
    facts.push({ icon: Building2, text: companyName });
    if (projectsCount !== null && !statsLoading) {
      facts.push({
        icon: FolderKanban,
        text: t("dashboard.hero.fact.activeJobs", { count: projectsCount }),
      });
    }
    if (teamCount !== null && !orgLoading && showTeam) {
      facts.push({
        icon: Users,
        text: t("dashboard.hero.fact.teamCount", { count: teamCount }),
      });
    }
    if (estimatesCount !== null && !statsLoading && showQuotes) {
      facts.push({
        icon: FileText,
        text: t("dashboard.hero.fact.quotes", { count: estimatesCount }),
      });
    }
    return facts;
  }, [
    companyName,
    projectsCount,
    estimatesCount,
    statsLoading,
    teamCount,
    orgLoading,
    showQuotes,
    showTeam,
    t,
  ]);

  return (
    <header
      className={cn(
        "relative overflow-hidden rounded-2xl border border-[#1D376A]/15",
        "bg-gradient-to-br from-[#1D376A]/[0.08] via-white to-[#e06737]/[0.06]",
        "shadow-sm"
      )}
    >
      <div
        className="pointer-events-none absolute -right-8 -top-8 size-40 rounded-full bg-[#1D376A]/[0.06] blur-2xl"
        aria-hidden
      />
      <div className="relative px-4 py-5 sm:px-6 sm:py-6">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0 flex-1 space-y-4">
            <div className="flex items-start gap-4">
              <CompanyLogo
                logoUrl={logoUrl}
                alt={companyName}
                size="hero"
                className="shrink-0"
              />
              <div className="min-w-0 flex-1 space-y-4">
            <div className="space-y-1">
              <p className="text-sm text-muted-foreground">
                {t(`dashboard.hero.greeting.${greetingKey}`, { name: firstName })}
              </p>
              <p className="text-base text-[#1D376A]/90 sm:text-lg">
                {t("dashboard.hero.manageCompany", { company: companyName })}
              </p>
            </div>

            <div className="flex flex-wrap gap-2" role="list" aria-label={t("dashboard.hero.statusBadges")}>
              {statusBadges.map((b) => (
                <HeroBadge key={b.key} variant={b.variant}>
                  {b.label}
                </HeroBadge>
              ))}
            </div>

            <div className="space-y-2 border-t border-[#1D376A]/10 pt-4">
              <div className="flex flex-wrap items-center gap-3">
                <h1 className="text-2xl font-semibold tracking-tight text-[#1D376A] sm:text-3xl">
                  {companyName}
                </h1>
              </div>
              <p className="max-w-xl text-sm leading-relaxed text-muted-foreground">
                {t("dashboard.hero.companyTagline")}
              </p>
              {identityFacts.length > 0 ? (
                <ul className="flex flex-wrap gap-x-4 gap-y-2 pt-1" role="list">
                  {identityFacts.map((fact, i) => {
                    const Icon = fact.icon;
                    return (
                      <li
                        key={i}
                        className="flex items-center gap-1.5 text-sm text-[#1D376A]/80"
                      >
                        <Icon className="size-4 shrink-0 opacity-70" aria-hidden />
                        <span>{fact.text}</span>
                      </li>
                    );
                  })}
                </ul>
              ) : null}
            </div>

            <Link
              href="/app/settings"
              className={cn(
                buttonVariants({ variant: "ghost", size: "sm" }),
                "h-8 px-2 text-[#1D376A] hover:bg-[#1D376A]/5"
              )}
            >
              <Settings className="size-4 mr-1.5" aria-hidden />
              {t("dashboard.hero.editCompanyProfile")}
            </Link>
              </div>
            </div>
          </div>

          <div className="flex shrink-0 flex-col gap-2 sm:min-w-[12rem] lg:items-stretch">
            <Link
              href="/app/projects/new"
              className={cn(
                buttonVariants({ size: "default" }),
                "bg-[#e06737] text-white hover:bg-[#c95a30] shadow-sm justify-center"
              )}
            >
              <Plus className="size-4 mr-2" aria-hidden />
              {t("dashboard.primaryNewJob")}
            </Link>
            {showQuotes ? (
            <Link
              href="/app/quotes/new"
              className={cn(
                buttonVariants({ variant: "outline", size: "default" }),
                "border-[#1D376A]/25 text-[#1D376A] justify-center"
              )}
            >
              <FileText className="size-4 mr-2" aria-hidden />
              {t("dashboard.secondaryNewQuote")}
            </Link>
            ) : null}
            {showTeam ? (
            <Link
              href="/app/members"
              className={cn(
                buttonVariants({ variant: "ghost", size: "default" }),
                "text-[#1D376A] justify-center hover:bg-[#1D376A]/5"
              )}
            >
              <UserPlus className="size-4 mr-2" aria-hidden />
              {t("dashboard.quick.inviteMember")}
            </Link>
            ) : null}
          </div>
        </div>
      </div>
    </header>
  );
}

function PersonalHeroCard({
  firstName,
  projectsCount,
  estimatesCount,
  statsLoading,
}: DashboardWorkspaceHeroProps) {
  const { t } = useI18n();
  const { availableWorkspaces } = useWorkspace();
  const { user } = useAuth();

  const greetingKey = getGreetingKey(new Date().getHours());
  const hasCompany = availableWorkspaces.some((w) => isCompanyWorkspaceType(w.type));

  const billingBadge = useMemo(() => {
    const b = user?.billing;
    if (!b) return null;
    if (b.status === "trial" && b.remainingTrialDays > 0) {
      return t("dashboard.hero.badge.trial");
    }
    if (b.isPro || b.status === "active") {
      return t("dashboard.hero.badge.solo");
    }
    return t("dashboard.hero.badge.free");
  }, [user?.billing, t]);

  return (
    <header
      className={cn(
        "relative overflow-hidden rounded-2xl border border-border",
        "bg-gradient-to-br from-muted/40 via-card to-[#1D376A]/[0.04]",
        "shadow-sm"
      )}
    >
      <div className="relative px-4 py-5 sm:px-6 sm:py-6">
        <div className="flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0 flex-1 space-y-3">
            <div className="space-y-1">
              <h1 className="text-xl font-semibold tracking-tight text-[#1D376A] sm:text-2xl">
                {t(`dashboard.hero.greeting.${greetingKey}`, { name: firstName })}
              </h1>
              <p className="text-sm text-muted-foreground leading-relaxed">
                {t("dashboard.hero.personalSubtitle")}
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <HeroBadge>{t("dashboard.hero.badge.personalWorkspace")}</HeroBadge>
              {billingBadge ? <HeroBadge variant="secondary">{billingBadge}</HeroBadge> : null}
            </div>
            {(projectsCount !== null || estimatesCount !== null) && !statsLoading ? (
              <ul className="flex flex-wrap gap-3 text-sm text-muted-foreground" role="list">
                {projectsCount !== null ? (
                  <li>{t("dashboard.hero.fact.activeJobs", { count: projectsCount })}</li>
                ) : null}
                {estimatesCount !== null ? (
                  <li>{t("dashboard.hero.fact.quotes", { count: estimatesCount })}</li>
                ) : null}
              </ul>
            ) : null}
          </div>
          <div className="flex shrink-0 flex-col gap-2 sm:min-w-[11rem]">
            <Link
              href="/app/projects/new"
              className={cn(
                buttonVariants({ size: "default" }),
                "bg-[#e06737] text-white hover:bg-[#c95a30] justify-center"
              )}
            >
              <Plus className="size-4 mr-2" aria-hidden />
              {t("dashboard.primaryNewJob")}
            </Link>
            <Link
              href="/app/quotes/new"
              className={cn(
                buttonVariants({ variant: "outline", size: "default" }),
                "border-[#1D376A]/25 justify-center"
              )}
            >
              {t("dashboard.secondaryNewQuote")}
            </Link>
            {!hasCompany ? (
              <Link
                href={BUSINESS_CREATE_ROUTE}
                className={cn(buttonVariants({ variant: "ghost", size: "default" }), "justify-center")}
              >
                <Building2 className="size-4 mr-2" aria-hidden />
                {t("dashboard.hero.createCompany")}
              </Link>
            ) : null}
          </div>
        </div>
      </div>
    </header>
  );
}

export function DashboardWorkspaceHero(props: DashboardWorkspaceHeroProps) {
  const isCompany = isCompanyWorkspaceType(props.activeWorkspace.type);

  if (isCompany) {
    return <CompanyHeroCard {...props} />;
  }
  return <PersonalHeroCard {...props} />;
}

export function DashboardHeroSkeleton() {
  return (
    <div
      className="h-[220px] sm:h-[200px] animate-pulse rounded-2xl bg-muted"
      aria-hidden
    />
  );
}
