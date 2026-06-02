"use client";

import Link from "next/link";
import { Building2, Settings } from "lucide-react";
import { useI18n } from "@/i18n/I18nContext";
import { useWorkspaceProduct } from "@/hooks/useWorkspaceProduct";
import { cn } from "@/lib/utils";

export function CompanyContextBar() {
  const { t } = useI18n();
  const { isCompany, companyName, canManage } = useWorkspaceProduct();

  if (!isCompany || !companyName) return null;

  return (
    <div
      className={cn(
        "border-b border-[#1D376A]/10 bg-gradient-to-r from-[#1D376A]/[0.05] to-transparent",
        "px-4 py-2 md:px-6"
      )}
      role="region"
      aria-label={t("companyContext.ariaLabel")}
    >
      <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2 text-sm">
          <Building2 className="size-4 shrink-0 text-[#1D376A]/80" aria-hidden />
          <span className="font-medium text-[#1D376A] truncate">{companyName}</span>
          <span className="hidden text-muted-foreground sm:inline">·</span>
          <span className="hidden text-muted-foreground sm:inline truncate">
            {t("companyContext.tagline")}
          </span>
        </div>
        {canManage ? (
          <Link
            href="/app/settings"
            className="inline-flex items-center gap-1 text-xs font-medium text-[#1D376A] hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#e06737]/50 rounded"
          >
            <Settings className="size-3.5" aria-hidden />
            {t("companyContext.settings")}
          </Link>
        ) : null}
      </div>
    </div>
  );
}
