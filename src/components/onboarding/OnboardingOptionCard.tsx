"use client";

import { cn } from "@/lib/utils";
import type { LucideIcon } from "lucide-react";

type OnboardingOptionCardProps = {
  title: string;
  description?: string;
  selected?: boolean;
  recommended?: boolean;
  onClick: () => void;
  icon?: LucideIcon;
};

export function OnboardingOptionCard({
  title,
  description,
  selected = false,
  recommended = false,
  onClick,
  icon: Icon,
}: OnboardingOptionCardProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "w-full rounded-xl border-2 p-4 text-left transition-all duration-200",
        selected
          ? "border-[#e06737] bg-[#fff7f4] shadow-md ring-2 ring-[#e06737]/20"
          : recommended
            ? "border-[#1D376A]/25 bg-[#f8fafc] hover:border-[#e06737]/50 hover:shadow-sm"
            : "border-[#cbd5e1] bg-white hover:border-[#e06737]/40 hover:shadow-sm"
      )}
    >
      <div className="flex items-start gap-3">
        {Icon ? (
          <span
            className={cn(
              "flex size-10 shrink-0 items-center justify-center rounded-lg",
              selected ? "bg-[#e06737] text-white" : "bg-[#e06737]/12 text-[#e06737]"
            )}
          >
            <Icon className="size-5" />
          </span>
        ) : null}
        <div>
          <p className={cn("font-semibold", selected ? "text-[#e06737]" : "text-[#111111]")}>{title}</p>
          {description ? (
            <p className="mt-1 text-sm text-[#555555]">{description}</p>
          ) : null}
        </div>
      </div>
    </button>
  );
}
