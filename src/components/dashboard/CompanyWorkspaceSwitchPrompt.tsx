"use client";

import Link from "next/link";
import { Building2 } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useI18n } from "@/i18n/I18nContext";
import { useWorkspace } from "@/context/WorkspaceContext";
import { useWorkspaceProduct } from "@/hooks/useWorkspaceProduct";
import { isCompanyWorkspaceType } from "@/types/workspace";

type CompanyWorkspaceSwitchPromptProps = {
  variant?: "card" | "banner";
};

export function CompanyWorkspaceSwitchPrompt({
  variant = "banner",
}: CompanyWorkspaceSwitchPromptProps) {
  const { t } = useI18n();
  const { availableWorkspaces, setActiveWorkspace } = useWorkspace();
  const { isCompany } = useWorkspaceProduct();

  if (isCompany) return null;

  const companyWorkspace = availableWorkspaces.find((w) =>
    isCompanyWorkspaceType(w.type)
  );
  if (!companyWorkspace) return null;

  if (variant === "banner") {
    return (
      <div
        className={cn(
          "flex flex-col gap-3 rounded-xl border border-[#1D376A]/15 bg-[#1D376A]/[0.04]",
          "px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4"
        )}
        role="status"
      >
        <div className="flex min-w-0 flex-1 items-start gap-2.5">
          <Building2 className="mt-0.5 size-4 shrink-0 text-[#1D376A] dark:text-primary" aria-hidden />
          <div className="min-w-0 space-y-0.5">
            <p className="text-sm font-medium text-foreground">
              {t("settings.registeredCompany.title")}
            </p>
            <p className="text-sm text-muted-foreground leading-relaxed">
              {t("settings.registeredCompany.body", { company: companyWorkspace.name })}
            </p>
          </div>
        </div>
        <div className="flex w-full shrink-0 flex-col gap-2 sm:w-auto sm:flex-row sm:justify-end">
          <Button
            type="button"
            size="sm"
            className="bg-[#e06737] hover:bg-[#c95a30] text-white"
            onClick={() => setActiveWorkspace(companyWorkspace)}
          >
            {t("settings.registeredCompany.switch")}
          </Button>
          <Link
            href="/app"
            onClick={() => setActiveWorkspace(companyWorkspace)}
            className={cn(buttonVariants({ variant: "outline", size: "sm" }))}
          >
            {t("settings.registeredCompany.openOverview")}
          </Link>
        </div>
      </div>
    );
  }

  return null;
}
