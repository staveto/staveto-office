"use client";

import { ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import type { LucideIcon } from "lucide-react";

type SidebarGroupButtonProps = {
  label: string;
  icon: LucideIcon;
  isExpanded: boolean;
  isSectionActive: boolean;
  collapsed: boolean;
  onToggle: () => void;
};

export function SidebarGroupButton({
  label,
  icon: Icon,
  isExpanded,
  isSectionActive,
  collapsed,
  onToggle,
}: SidebarGroupButtonProps) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-expanded={collapsed ? undefined : isExpanded}
      className={cn(
        "flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-sm font-medium transition-colors",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#e06737]/60 focus-visible:ring-offset-2 focus-visible:ring-offset-[#1D376A]",
        isSectionActive
          ? "bg-white/10 text-white"
          : "text-white/90 hover:bg-white/8"
      )}
    >
      <Icon className="size-4 shrink-0 text-white/80" aria-hidden />
      {!collapsed && (
        <>
          <span className="flex-1 truncate">{label}</span>
          <ChevronRight
            className={cn(
              "size-4 shrink-0 text-white/60 transition-transform duration-200",
              isExpanded && "rotate-90"
            )}
            aria-hidden
          />
        </>
      )}
    </button>
  );
}
