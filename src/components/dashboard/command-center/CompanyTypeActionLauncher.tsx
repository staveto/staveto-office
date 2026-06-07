"use client";

import Link from "next/link";
import {
  Wrench,
  Building2,
  ClipboardList,
  User,
  Zap,
  Hammer,
  Search,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useI18n } from "@/i18n/I18nContext";
import type { CompanyType } from "@/lib/onboardingTypes";
import {
  getCompanyTypeActions,
  type CompanyTypeAction,
} from "@/lib/dashboardCommandCenter";

const ICON_MAP: Record<CompanyTypeAction["icon"], LucideIcon> = {
  wrench: Wrench,
  building: Building2,
  clipboard: ClipboardList,
  user: User,
  zap: Zap,
  hammer: Hammer,
  search: Search,
};

type CompanyTypeActionLauncherProps = {
  companyType: CompanyType;
};

export function CompanyTypeActionLauncher({ companyType }: CompanyTypeActionLauncherProps) {
  const { t } = useI18n();
  const actions = getCompanyTypeActions(companyType);

  return (
    <section className="space-y-4">
      <div>
        <h2 className="text-base font-semibold tracking-tight text-foreground">
          {t("dashboard.command.launcher.title")}
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          {t(`dashboard.command.launcher.subtitle.${companyType}`)}
        </p>
      </div>
      <div className="grid gap-2 sm:grid-cols-2">
        {actions.map((action) => {
          const Icon = ICON_MAP[action.icon];
          return (
            <Link
              key={action.id}
              href={action.href}
              className={cn(
                "group flex min-h-[3.25rem] items-center gap-3 rounded-xl px-4 py-3",
                "bg-background ring-1 ring-border/60 transition-all",
                "hover:bg-muted/30 hover:ring-[#1D376A]/20"
              )}
            >
              <span
                className={cn(
                  "flex size-9 shrink-0 items-center justify-center rounded-lg",
                  "bg-[#1D376A]/[0.07] text-[#1D376A] transition-colors",
                  "group-hover:bg-[#1D376A]/10"
                )}
                aria-hidden
              >
                <Icon className="size-4" />
              </span>
              <span className="text-sm font-medium text-foreground">
                {t(`dashboard.command.launcher.${companyType}.${action.id}`)}
              </span>
            </Link>
          );
        })}
      </div>
    </section>
  );
}
