"use client";

import Link from "next/link";
import { cn } from "@/lib/utils";
import { useI18n } from "@/i18n/I18nContext";
import { useCompanyBranding } from "@/hooks/useCompanyBranding";
import { CompanyLogo } from "@/components/branding/CompanyLogo";

type SidebarBrandProps = {
  expanded: boolean;
  onNavigate?: () => void;
};

export function SidebarBrand({ expanded, onNavigate }: SidebarBrandProps) {
  const { t } = useI18n();
  const { isCompany, logoUrl, displayName } = useCompanyBranding();

  if (isCompany) {
    return (
      <Link
        href="/app"
        onClick={onNavigate}
        className={cn(
          "flex min-w-0 items-center text-white no-underline transition-transform duration-200 hover:scale-[1.02]",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#e06737]/80 focus-visible:ring-offset-2 focus-visible:ring-offset-[#132743]",
          expanded ? "flex-1 gap-2.5 rounded-md" : "size-9 justify-center"
        )}
        aria-label={displayName ?? t("app.brand")}
        title={displayName ?? undefined}
      >
        <CompanyLogo
          logoUrl={logoUrl}
          alt={displayName ?? ""}
          size={expanded ? "sm" : "sm"}
          variant="sidebar"
          className={cn(!expanded && "size-9 rounded-lg")}
        />
        {expanded ? (
          <span className="min-w-0 truncate text-sm font-semibold tracking-tight">
            {displayName ?? t("app.brand")}
          </span>
        ) : null}
      </Link>
    );
  }

  return (
    <Link
      href="/app"
      onClick={onNavigate}
      className={cn(
        "flex min-w-0 items-center text-white no-underline transition-transform duration-200 hover:scale-[1.02]",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#e06737]/80 focus-visible:ring-offset-2 focus-visible:ring-offset-[#132743]",
        expanded ? "flex-1 gap-2 rounded-md" : "size-9 justify-center rounded-lg"
      )}
      aria-label={t("header.context.personalLabel")}
      title={t("header.context.personalLabel")}
    >
      <span
        className={cn(
          "flex shrink-0 items-center justify-center rounded-lg bg-white/10 font-bold text-white",
          expanded ? "size-8 text-xs" : "size-full text-xs"
        )}
      >
        OP
      </span>
      {expanded ? (
        <span className="min-w-0 truncate text-sm font-semibold tracking-tight">
          {t("header.context.personalLabel")}
        </span>
      ) : null}
    </Link>
  );
}
