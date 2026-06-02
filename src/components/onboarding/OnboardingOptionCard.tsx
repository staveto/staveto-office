"use client";

import { cn } from "@/lib/utils";
import type { LucideIcon } from "lucide-react";

type OnboardingOptionCardProps = {
  title: string;
  description?: string;
  selected?: boolean;
  onClick: () => void;
  icon?: LucideIcon;
};

export function OnboardingOptionCard({
  title,
  description,
  selected = false,
  onClick,
  icon: Icon,
}: OnboardingOptionCardProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "w-full rounded-xl border-2 p-4 text-left transition-colors",
        selected
          ? "border-[#e06737] bg-[#e06737]/5"
          : "border-border bg-background hover:border-[#e06737]/40"
      )}
    >
      <div className="flex items-start gap-3">
        {Icon ? (
          <span
            className={cn(
              "flex size-10 shrink-0 items-center justify-center rounded-lg",
              selected ? "bg-[#e06737] text-white" : "bg-muted text-muted-foreground"
            )}
          >
            <Icon className="size-5" />
          </span>
        ) : null}
        <div>
          <p className="font-medium">{title}</p>
          {description ? (
            <p className="mt-1 text-sm text-muted-foreground">{description}</p>
          ) : null}
        </div>
      </div>
    </button>
  );
}
