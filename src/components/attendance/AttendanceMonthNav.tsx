"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useI18n } from "@/i18n/I18nContext";

const LOCALE_MAP: Record<string, string> = {
  en: "en-GB",
  de: "de-DE",
  sk: "sk-SK",
};

type AttendanceMonthNavProps = {
  year: number;
  month: number;
  onPrev: () => void;
  onNext: () => void;
  disableNext?: boolean;
};

export function AttendanceMonthNav({
  year,
  month,
  onPrev,
  onNext,
  disableNext,
}: AttendanceMonthNavProps) {
  const { locale } = useI18n();
  const label = new Date(year, month - 1, 1).toLocaleDateString(LOCALE_MAP[locale] ?? "en-GB", {
    month: "long",
    year: "numeric",
  });

  return (
    <div className="flex items-center justify-center gap-2">
      <Button type="button" variant="outline" size="icon" onClick={onPrev} aria-label="Previous month">
        <ChevronLeft className="size-5" />
      </Button>
      <span className="min-w-[180px] text-center text-base font-semibold capitalize">{label}</span>
      <Button
        type="button"
        variant="outline"
        size="icon"
        onClick={onNext}
        disabled={disableNext}
        aria-label="Next month"
      >
        <ChevronRight className="size-5" />
      </Button>
    </div>
  );
}
