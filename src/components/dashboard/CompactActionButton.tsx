"use client";

import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { useI18n } from "@/i18n/I18nContext";

type CompactActionButtonProps = {
  label: string;
  icon: LucideIcon;
  href?: string;
  disabled?: boolean;
  comingSoonLabel?: string;
};

export function CompactActionButton({
  label,
  icon: Icon,
  href,
  disabled = false,
  comingSoonLabel,
}: CompactActionButtonProps) {
  const { t } = useI18n();
  const soonLabel = comingSoonLabel ?? t("dashboard.comingSoon");
  const baseClass = cn(
    "inline-flex min-h-9 items-center gap-2 rounded-lg border px-3 py-2 text-sm font-medium transition-colors",
    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#e06737]/50 focus-visible:ring-offset-2",
    disabled
      ? "cursor-not-allowed border-border/60 bg-muted/30 text-muted-foreground"
      : "border-border bg-card text-foreground hover:border-[#1D376A]/30 hover:bg-[#1D376A]/5"
  );

  if (disabled || !href) {
    return (
      <span className={baseClass} aria-disabled="true">
        <Icon className="size-4 shrink-0 opacity-60" aria-hidden />
        <span className="truncate">{label}</span>
        <span className="ml-auto shrink-0 text-[10px] uppercase tracking-wide text-muted-foreground">
          {soonLabel}
        </span>
      </span>
    );
  }

  return (
    <Link href={href} className={baseClass}>
      <Icon className="size-4 shrink-0 text-[#1D376A]/80" aria-hidden />
      <span className="truncate">{label}</span>
    </Link>
  );
}
