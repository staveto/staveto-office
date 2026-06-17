"use client";

import { Briefcase, Package, Wrench } from "lucide-react";
import { cn } from "@/lib/utils";
import { useI18n } from "@/i18n/I18nContext";
import type { EquipmentFilterKey } from "./equipmentUtils";

type EquipmentKpiCardsProps = {
  total: number;
  assigned: number;
  inService: number;
  activeFilter?: EquipmentFilterKey;
  onFilterChange?: (filter: EquipmentFilterKey) => void;
};

export function EquipmentKpiCards({
  total,
  assigned,
  inService,
  activeFilter = "all",
  onFilterChange,
}: EquipmentKpiCardsProps) {
  const { t } = useI18n();

  const cards: {
    key: EquipmentFilterKey;
    label: string;
    value: number;
    icon: typeof Package;
    accent: string;
    ring: string;
  }[] = [
    {
      key: "all",
      label: t("equipmentTab.statTotal"),
      value: total,
      icon: Package,
      accent: "text-[#1D376A]",
      ring: "ring-[#1D376A]/30",
    },
    {
      key: "assigned",
      label: t("equipmentTab.statAssigned"),
      value: assigned,
      icon: Briefcase,
      accent: "text-sky-700",
      ring: "ring-sky-300/50",
    },
    {
      key: "in_service",
      label: t("equipmentTab.statInService"),
      value: inService,
      icon: Wrench,
      accent: "text-amber-700",
      ring: "ring-amber-300/50",
    },
  ];

  return (
    <div className="grid gap-3 sm:grid-cols-3">
      {cards.map((card) => {
        const Icon = card.icon;
        const active = activeFilter === card.key;
        const interactive = Boolean(onFilterChange);

        const body = (
          <>
            <div className="flex items-center justify-between gap-2">
              <span className="text-sm font-medium text-muted-foreground">{card.label}</span>
              <span
                className={cn(
                  "flex size-9 items-center justify-center rounded-xl bg-[#F8FAFC]",
                  card.accent
                )}
              >
                <Icon className="size-4" aria-hidden />
              </span>
            </div>
            <p className={cn("mt-2 text-3xl font-bold tabular-nums tracking-tight", card.accent)}>
              {card.value}
            </p>
          </>
        );

        if (!interactive) {
          return (
            <div
              key={card.key}
              className="rounded-2xl border border-[#E2E8F0] bg-white p-4 shadow-sm"
            >
              {body}
            </div>
          );
        }

        return (
          <button
            key={card.key}
            type="button"
            onClick={() => onFilterChange?.(card.key)}
            className={cn(
              "rounded-2xl border bg-white p-4 text-left shadow-sm transition-all duration-200",
              "hover:-translate-y-0.5 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#e06737]/50",
              active
                ? cn("border-[#E06737]/40 bg-[#FFF8F4] ring-2", card.ring)
                : "border-[#E2E8F0] hover:border-[#CBD5E1]"
            )}
            aria-pressed={active}
          >
            {body}
          </button>
        );
      })}
    </div>
  );
}
