"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  ClipboardList,
  Users,
  Truck,
  Wrench,
  FileText,
  Receipt,
  LayoutDashboard,
  X,
  ArrowRight,
  type LucideIcon,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button, buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useI18n } from "@/i18n/I18nContext";
import { useAuth } from "@/context/AuthContext";
import { getOrganization } from "@/lib/organizations";
import type { CompanyType } from "@/lib/onboardingTypes";
import {
  dismissWelcomeGuide,
  saveWelcomeGuideModule,
  resolveWelcomeGuideCompanyType,
  isWelcomeGuideModuleId,
  type WelcomeGuideModuleId,
  WELCOME_GUIDE_MODULE_IDS,
} from "@/services/onboarding/welcomeGuideService";
import { useEnabledModules } from "@/context/EnabledModulesContext";
import { isModuleEnabled, type ModuleKey } from "@/lib/enabledModules";

type ModuleConfig = {
  id: WelcomeGuideModuleId;
  icon: LucideIcon;
  href: string;
  bulletKeys: string[];
};

const MODULE_CONFIG: ModuleConfig[] = [
  {
    id: "jobs",
    icon: ClipboardList,
    href: "/app/projects/new",
    bulletKeys: ["customer", "tasks", "photos", "documents", "expenses"],
  },
  {
    id: "team",
    icon: Users,
    href: "/app/members",
    bulletKeys: ["accounts", "roles", "assigned", "attendance"],
  },
  {
    id: "vehicles",
    icon: Truck,
    href: "/app/settings",
    bulletKeys: ["assigned", "documents", "service", "costs"],
  },
  {
    id: "tools",
    icon: Wrench,
    href: "/app/settings",
    bulletKeys: ["tools", "machines", "assignment", "qr"],
  },
  {
    id: "documents",
    icon: FileText,
    href: "/app/projects",
    bulletKeys: ["project", "photos", "reports", "invoices"],
  },
  {
    id: "offers",
    icon: Receipt,
    href: "/app/quotes/new",
    bulletKeys: ["draft", "approval", "pdf", "link"],
  },
  {
    id: "dashboard",
    icon: LayoutDashboard,
    href: "/app",
    bulletKeys: ["active", "tasks", "team", "alerts"],
  },
];

const WELCOME_MODULE_MAP: Partial<Record<WelcomeGuideModuleId, ModuleKey>> = {
  jobs: "jobs",
  team: "team",
  vehicles: "vehicles",
  tools: "equipment",
  documents: "documents",
  offers: "quotes",
};

type BusinessWelcomeGuideProps = {
  orgId: string;
};

export function BusinessWelcomeGuide({ orgId }: BusinessWelcomeGuideProps) {
  const { t } = useI18n();
  const { user, profile, refreshUser } = useAuth();
  const { modules } = useEnabledModules();
  const [companyType, setCompanyType] = useState<CompanyType>("other");
  const [selectedModule, setSelectedModule] = useState<WelcomeGuideModuleId>("jobs");
  const [dismissing, setDismissing] = useState(false);

  useEffect(() => {
    const saved = profile?.welcomeGuide?.lastOpenedModule;
    if (saved && isWelcomeGuideModuleId(saved)) {
      setSelectedModule(saved);
    }
  }, [profile?.welcomeGuide?.lastOpenedModule]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const org = await getOrganization(orgId);
      if (cancelled) return;
      setCompanyType(resolveWelcomeGuideCompanyType(org?.companyType));
    })();
    return () => {
      cancelled = true;
    };
  }, [orgId]);

  const visibleModules = useMemo(
    () =>
      MODULE_CONFIG.filter((module) => {
        if (module.id === "dashboard") return false;
        const moduleKey = WELCOME_MODULE_MAP[module.id];
        if (!moduleKey) return true;
        return isModuleEnabled(modules, moduleKey);
      }),
    [modules]
  );

  const activeModule =
    visibleModules.find((m) => m.id === selectedModule) ?? visibleModules[0] ?? MODULE_CONFIG[0];
  const ActiveIcon = activeModule.icon;

  useEffect(() => {
    if (!visibleModules.some((m) => m.id === selectedModule)) {
      setSelectedModule(visibleModules[0]?.id ?? "jobs");
    }
  }, [visibleModules, selectedModule]);

  const selectModule = (id: WelcomeGuideModuleId) => {
    setSelectedModule(id);
    if (user?.id) {
      void saveWelcomeGuideModule(user.id, id);
    }
  };

  const handleDismiss = async () => {
    if (!user?.id || dismissing) return;
    setDismissing(true);
    try {
      await dismissWelcomeGuide(user.id);
      await refreshUser();
    } finally {
      setDismissing(false);
    }
  };

  return (
    <Card className="border-[#1D376A]/20 bg-gradient-to-br from-[#1D376A]/[0.07] to-transparent shadow-sm">
      <CardHeader className="flex flex-row items-start justify-between gap-3 pb-3">
        <div>
          <CardTitle className="text-lg text-[#1D376A]">
            {t("welcomeGuide.title")}
          </CardTitle>
          <p className="mt-1 text-sm text-muted-foreground leading-relaxed">
            {t("welcomeGuide.subtitle")}
          </p>
        </div>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          disabled={dismissing}
          onClick={() => void handleDismiss()}
        >
          <X className="size-4" aria-hidden />
          <span className="sr-only">{t("welcomeGuide.dismiss")}</span>
        </Button>
      </CardHeader>

      <CardContent className="space-y-4">
        <div className="rounded-xl border border-[#e06737]/30 bg-[#e06737]/[0.06] p-4">
          <p className="text-sm font-medium text-[#1D376A]">
            {t(`welcomeGuide.recommended.${companyType}`)}
          </p>
          <Link
            href="/app/projects/new"
            className={cn(
              buttonVariants({ size: "sm" }),
              "mt-3 inline-flex bg-[#e06737] hover:bg-[#e06737]/90"
            )}
          >
            {t("welcomeGuide.recommended.cta")}
            <ArrowRight className="size-3.5" data-icon="inline-end" />
          </Link>
        </div>

        <div className="grid gap-4 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)]">
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-2 xl:grid-cols-3">
            {visibleModules.map((module) => {
              const Icon = module.icon;
              const isSelected = selectedModule === module.id;
              return (
                <button
                  key={module.id}
                  type="button"
                  onClick={() => selectModule(module.id)}
                  className={cn(
                    "flex flex-col items-start gap-2 rounded-xl border-2 p-3 text-left transition-colors",
                    isSelected
                      ? "border-[#e06737] bg-[#e06737]/5 ring-1 ring-[#e06737]/20"
                      : "border-border bg-background hover:border-[#1D376A]/25"
                  )}
                >
                  <Icon
                    className={cn(
                      "size-5",
                      isSelected ? "text-[#e06737]" : "text-[#1D376A]/70"
                    )}
                    aria-hidden
                  />
                  <span className="text-sm font-medium leading-tight">
                    {t(`welcomeGuide.module.${module.id}.title`)}
                  </span>
                </button>
              );
            })}
          </div>

          <div className="rounded-xl border border-[#1D376A]/15 bg-background p-4">
            <div className="flex items-center gap-2">
              <ActiveIcon className="size-5 text-[#1D376A]" aria-hidden />
              <h3 className="font-semibold text-[#1D376A]">
                {t(`welcomeGuide.module.${activeModule.id}.title`)}
              </h3>
            </div>
            <p className="mt-2 text-sm text-muted-foreground leading-relaxed">
              {t(`welcomeGuide.module.${activeModule.id}.description`)}
            </p>
            <ul className="mt-3 space-y-1.5 text-sm text-muted-foreground">
              {activeModule.bulletKeys.map((key) => (
                <li key={key} className="flex gap-2">
                  <span className="text-[#e06737]" aria-hidden>
                    •
                  </span>
                  <span>{t(`welcomeGuide.module.${activeModule.id}.bullet.${key}`)}</span>
                </li>
              ))}
            </ul>
            <Link
              href={activeModule.href}
              className={cn(
                buttonVariants({ variant: "outline", size: "sm" }),
                "mt-4 inline-flex border-[#1D376A]/20"
              )}
            >
              {t(`welcomeGuide.module.${activeModule.id}.cta`)}
              <ArrowRight className="size-3.5" data-icon="inline-end" />
            </Link>
          </div>
        </div>

        <div className="flex justify-end pt-1">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="text-muted-foreground"
            disabled={dismissing}
            onClick={() => void handleDismiss()}
          >
            {t("welcomeGuide.dismiss")}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

export { WELCOME_GUIDE_MODULE_IDS };
