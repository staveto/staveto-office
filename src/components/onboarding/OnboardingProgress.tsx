"use client";

import { cn } from "@/lib/utils";
import { useI18n } from "@/i18n/I18nContext";

type OnboardingProgressProps = {
  current: number;
  total: number;
  className?: string;
};

export function OnboardingProgress({ current, total, className }: OnboardingProgressProps) {
  const { t } = useI18n();
  return (
    <div
      className={cn("flex gap-1.5", className)}
      aria-label={t("onboarding.progress", { current, total })}
    >
      {Array.from({ length: total }).map((_, i) => (
        <div
          key={i}
          className={cn(
            "h-2 flex-1 rounded-full transition-all duration-300",
            i < current ? "bg-[#e06737]" : "bg-[#1D376A]/12"
          )}
        />
      ))}
    </div>
  );
}
