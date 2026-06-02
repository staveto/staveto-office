"use client";

import { ChevronLeft, ChevronRight, PanelLeftClose, PanelLeftOpen } from "lucide-react";
import { cn } from "@/lib/utils";
import { useI18n } from "@/i18n/I18nContext";
import { useSidebarLayout } from "@/context/SidebarLayoutContext";

type SidebarExpandButtonProps = {
  collapsed: boolean;
  variant?: "icon" | "full";
  className?: string;
};

export function SidebarExpandButton({
  collapsed,
  variant = "full",
  className,
}: SidebarExpandButtonProps) {
  const { t } = useI18n();
  const { toggleExpanded } = useSidebarLayout();

  const label = collapsed ? t("sidebar.expand") : t("sidebar.collapse");

  if (variant === "icon") {
    return (
      <button
        type="button"
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          toggleExpanded();
        }}
        className={cn(
          "flex size-8 shrink-0 items-center justify-center rounded-lg text-white/75",
          "hover:bg-white/10 hover:text-white transition-colors",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#e06737]/70",
          className
        )}
        aria-label={label}
        title={label}
      >
        {collapsed ? (
          <PanelLeftOpen className="size-4" aria-hidden />
        ) : (
          <PanelLeftClose className="size-4" aria-hidden />
        )}
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        toggleExpanded();
      }}
      className={cn(
        "flex items-center justify-center gap-2 rounded-lg text-white/80 transition-colors",
        "hover:bg-white/10 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#e06737]/70",
        collapsed ? "size-9 w-full" : "w-full px-3 py-2 text-sm",
        className
      )}
      aria-label={label}
      title={label}
    >
      {collapsed ? (
        <ChevronRight className="size-5" aria-hidden />
      ) : (
        <>
          <ChevronLeft className="size-4 shrink-0" aria-hidden />
          <span className="truncate">{t("sidebar.collapse")}</span>
        </>
      )}
    </button>
  );
}
