"use client";

import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import { FolderKanban, FileText, UserPlus, Upload } from "lucide-react";
import { cn } from "@/lib/utils";
import { buttonVariants } from "@/components/ui/button";
import { useI18n } from "@/i18n/I18nContext";
import type { EnabledModulesMap } from "@/lib/enabledModules";
import { isModuleEnabled } from "@/lib/enabledModules";

type PrimaryActionsRowProps = {
  modules: EnabledModulesMap;
  canManage: boolean;
  comingSoonLabel: string;
};

type ActionDef = {
  key: string;
  labelKey: string;
  href?: string;
  icon: LucideIcon;
  primary?: boolean;
  disabled?: boolean;
  visible: boolean;
};

export function PrimaryActionsRow({
  modules,
  canManage,
  comingSoonLabel,
}: PrimaryActionsRowProps) {
  const { t } = useI18n();

  if (!canManage) return null;

  const actions: ActionDef[] = [
    {
      key: "new-job",
      labelKey: "dashboard.primaryNewJob",
      href: "/app/projects/new",
      icon: FolderKanban,
      primary: true,
      visible: true,
    },
    {
      key: "new-offer",
      labelKey: "dashboard.secondaryNewQuote",
      href: "/app/quotes/new",
      icon: FileText,
      visible: isModuleEnabled(modules, "quotes"),
    },
    {
      key: "invite",
      labelKey: "dashboard.quick.inviteMember",
      href: "/app/members",
      icon: UserPlus,
      visible: isModuleEnabled(modules, "team"),
    },
    {
      key: "upload-doc",
      labelKey: "dashboard.quick.uploadDoc",
      icon: Upload,
      disabled: true,
      visible: isModuleEnabled(modules, "documents"),
    },
  ].filter((a) => a.visible);

  return (
    <section aria-label={t("dashboard.command.primaryActions")}>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {actions.map((action) => {
          const Icon = action.icon;
          const label = t(action.labelKey);

          if (action.disabled || !action.href) {
            return (
              <div
                key={action.key}
                className={cn(
                  "flex min-h-[3.5rem] items-center gap-3 rounded-2xl px-5 py-4",
                  "bg-muted/30 text-muted-foreground ring-1 ring-border/40"
                )}
                aria-disabled
              >
                <Icon className="size-5 shrink-0 opacity-50" aria-hidden />
                <span className="text-sm font-medium">{label}</span>
                <span className="ml-auto text-[10px] uppercase tracking-wide opacity-60">
                  {comingSoonLabel}
                </span>
              </div>
            );
          }

          return (
            <Link
              key={action.key}
              href={action.href}
              className={cn(
                buttonVariants({ variant: action.primary ? "default" : "outline" }),
                "h-auto min-h-[3.5rem] justify-start gap-3 rounded-2xl px-5 py-4 text-left text-sm font-medium",
                action.primary &&
                  "border-0 bg-[#1D376A] text-white shadow-sm hover:bg-[#1D376A]/90"
              )}
            >
              <Icon className="size-5 shrink-0" aria-hidden />
              {label}
            </Link>
          );
        })}
      </div>
    </section>
  );
}
