"use client";

import { cn } from "@/lib/utils";

type NavCountBadgeProps = {
  count: number;
  className?: string;
  /** Sidebar (dark) vs header (light) styling */
  variant?: "sidebar" | "header" | "flyout";
};

export function NavCountBadge({ count, className, variant = "sidebar" }: NavCountBadgeProps) {
  if (count <= 0) return null;

  const label = count > 99 ? "99+" : String(count);

  return (
    <span
      className={cn(
        "inline-flex min-w-[1.15rem] shrink-0 items-center justify-center rounded-full px-1.5 py-0.5 text-[10px] font-bold leading-none tabular-nums",
        variant === "sidebar" && "bg-[#e06737] text-white",
        variant === "flyout" && "bg-[#e06737] text-white",
        variant === "header" && "bg-[#e06737] text-white",
        className
      )}
      aria-hidden
    >
      {label}
    </span>
  );
}
