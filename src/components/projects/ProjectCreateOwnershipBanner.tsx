"use client";

import { Building2, User } from "lucide-react";
import { useI18n } from "@/i18n/I18nContext";
import { useWorkspaceProduct } from "@/hooks/useWorkspaceProduct";
import { cn } from "@/lib/utils";

type ProjectCreateOwnershipBannerProps = {
  className?: string;
};

export function ProjectCreateOwnershipBanner({ className }: ProjectCreateOwnershipBannerProps) {
  const { t } = useI18n();
  const { isCompany, companyName, activeWorkspace } = useWorkspaceProduct();

  const Icon = isCompany ? Building2 : User;
  const message = isCompany
    ? t("projects.ownership.createCompany", {
        company: companyName ?? activeWorkspace?.name ?? "—",
      })
    : t("projects.ownership.createPersonal");

  return (
    <div
      className={cn(
        "flex items-start gap-2.5 rounded-xl border px-4 py-3 text-sm leading-relaxed",
        isCompany
          ? "border-[#1D376A]/20 bg-[#1D376A]/[0.05] text-[#1D376A]"
          : "border-amber-500/25 bg-amber-500/[0.07] text-amber-950 dark:text-amber-100",
        className
      )}
      role="status"
    >
      <Icon className="mt-0.5 size-4 shrink-0 opacity-80" aria-hidden />
      <p>{message}</p>
    </div>
  );
}
