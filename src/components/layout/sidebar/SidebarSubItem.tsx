"use client";

import Link from "next/link";
import { cn } from "@/lib/utils";
import type { NavItemConfig } from "@/lib/sidebarNavigation";
import { LanguageSelectCompact } from "@/components/settings/LanguageSettings";

type SidebarSubItemProps = {
  item: NavItemConfig;
  label: string;
  comingSoonLabel: string;
  isActive: boolean;
  variant?: "inline" | "flyout";
  onNavigate?: () => void;
  onLogout?: () => void;
  quietComingSoon?: boolean;
};

export function SidebarSubItem({
  item,
  label,
  comingSoonLabel,
  isActive,
  variant = "inline",
  quietComingSoon = false,
  onNavigate,
  onLogout,
}: SidebarSubItemProps) {
  const isFlyout = variant === "flyout";

  const baseClass = cn(
    "flex w-full items-center justify-between gap-2 rounded-md py-2 text-sm transition-colors duration-150",
    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#e06737]/50",
    isFlyout ? "px-3 text-foreground/90" : "pl-9 pr-2",
    !isFlyout &&
      "focus-visible:ring-offset-2 focus-visible:ring-offset-[#1D376A]"
  );

  if (item.action === "locale") {
    if (isFlyout) {
      return (
        <li className="py-1">
          <p className="px-3 pb-1 text-xs font-semibold uppercase tracking-wide text-[#1D376A]/70">
            {label}
          </p>
          <LanguageSelectCompact />
        </li>
      );
    }
    return (
      <li>
        <div className={cn(baseClass, "flex-col items-stretch gap-2 py-3 cursor-default")}>
          <span className="text-white/90">{label}</span>
          <LanguageSelectCompact className="[&_button]:text-white/85 [&_button:hover]:bg-white/10 [&_button[aria-pressed=true]]:bg-white/15 [&_button[aria-pressed=true]]:text-white" />
        </div>
      </li>
    );
  }

  if (item.action === "logout") {
    return (
      <li>
        <button
          type="button"
          onClick={onLogout}
          className={cn(
            baseClass,
            isFlyout
              ? "hover:bg-muted/80 text-foreground"
              : "text-white/85 hover:bg-white/8 hover:text-white"
          )}
        >
          <span>{label}</span>
        </button>
      </li>
    );
  }

  if (item.comingSoon || !item.href) {
    return (
      <li>
        <span
          className={cn(
            baseClass,
            "cursor-default",
            quietComingSoon
              ? isFlyout
                ? "text-muted-foreground/70 text-sm"
                : "text-white/30 text-sm pl-9"
              : isFlyout
                ? "cursor-not-allowed text-muted-foreground"
                : "cursor-not-allowed text-white/45"
          )}
          aria-disabled="true"
        >
          <span>{label}</span>
          {!quietComingSoon ? (
            <span
              className={cn(
                "shrink-0 rounded px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide",
                isFlyout ? "bg-muted text-muted-foreground" : "bg-white/10 text-white/70"
              )}
            >
              {comingSoonLabel}
            </span>
          ) : null}
        </span>
      </li>
    );
  }

  return (
    <li>
      <Link
        href={item.href}
        onClick={onNavigate}
        className={cn(
          baseClass,
          isFlyout
            ? isActive
              ? "bg-[#1D376A]/8 font-medium text-[#1D376A] border-l-2 border-[#e06737]"
              : "hover:bg-muted/70 border-l-2 border-transparent"
            : isActive
              ? "bg-white/12 text-white font-medium border-l-2 border-[#e06737] pl-[calc(2.25rem-2px)]"
              : "text-white/85 hover:bg-white/8 hover:text-white border-l-2 border-transparent"
        )}
        aria-current={isActive ? "page" : undefined}
      >
        <span>{label}</span>
      </Link>
    </li>
  );
}
