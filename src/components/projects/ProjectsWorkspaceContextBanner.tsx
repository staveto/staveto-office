"use client";

import { Building2, User } from "lucide-react";
import { useI18n } from "@/i18n/I18nContext";
import { useWorkspaceProduct } from "@/hooks/useWorkspaceProduct";
import { cn } from "@/lib/utils";

export function ProjectsWorkspaceContextBanner({ className }: { className?: string }) {
  const { t } = useI18n();
  const { isCompany, companyName, activeWorkspace } = useWorkspaceProduct();

  const Icon = isCompany ? Building2 : User;
  const message = isCompany
    ? t("projects.ownership.contextCompany", {
        company: companyName ?? activeWorkspace?.name ?? "—",
      })
    : t("projects.ownership.contextPersonal");

  return (
    <div
      className={cn(
        "flex items-start gap-2.5 rounded-lg border px-3 py-2.5 text-sm leading-relaxed",
        isCompany
          ? "border-[#1D376A]/15 bg-[#1D376A]/[0.04] text-[#1D376A]/90"
          : "border-slate-300/40 bg-slate-500/[0.06] text-slate-700 dark:text-slate-200",
        className
      )}
      role="status"
    >
      <Icon className="mt-0.5 size-4 shrink-0 opacity-70" aria-hidden />
      <p>{message}</p>
    </div>
  );
}
