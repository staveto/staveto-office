"use client";

import { Search, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useI18n } from "@/i18n/I18nContext";
import {
  type EquipmentFilterKey,
  EQUIPMENT_STATUS_FILTERS,
} from "./equipmentUtils";
import { eqCategoryPill } from "./equipmentFormStyles";

const FILTER_LABEL_KEYS: Record<EquipmentFilterKey, string> = {
  all: "equipmentTab.filterAll",
  available: "equipmentTab.filterAvailable",
  assigned: "equipmentTab.filterAssigned",
  in_service: "equipmentTab.filterInService",
  inactive: "equipmentTab.status.inactive",
};

type EquipmentListToolbarProps = {
  search: string;
  onSearchChange: (value: string) => void;
  filter: EquipmentFilterKey;
  onFilterChange: (filter: EquipmentFilterKey) => void;
  filterCounts: Record<EquipmentFilterKey, number>;
  shownCount: number;
  totalCount: number;
};

export function EquipmentListToolbar({
  search,
  onSearchChange,
  filter,
  onFilterChange,
  filterCounts,
  shownCount,
  totalCount,
}: EquipmentListToolbarProps) {
  const { t } = useI18n();
  const visibleFilters = EQUIPMENT_STATUS_FILTERS.filter((f) => f !== "inactive");
  const hasActiveQuery = search.trim().length > 0 || filter !== "all";

  return (
    <div className="overflow-hidden rounded-2xl border border-[#E2E8F0] bg-white shadow-sm">
      <div className="flex flex-col gap-3 border-b border-[#E2E8F0] p-4 sm:flex-row sm:items-center">
        <div className="relative min-w-0 flex-1">
          <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder={t("equipmentTab.searchPlaceholder")}
            className="h-11 border-[#E2E8F0] bg-[#F8FAFC] pl-9 focus-visible:bg-white"
          />
        </div>
        {hasActiveQuery ? (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="shrink-0 text-muted-foreground"
            onClick={() => {
              onSearchChange("");
              onFilterChange("all");
            }}
          >
            <X className="mr-1.5 size-4" />
            {t("equipmentTab.clearFilters")}
          </Button>
        ) : null}
      </div>

      <div className="flex flex-wrap gap-2 p-3">
        {visibleFilters.map((f) => {
          const count = filterCounts[f];
          const active = filter === f;
          return (
            <button
              key={f}
              type="button"
              onClick={() => onFilterChange(f)}
              className={cn(
                eqCategoryPill(active),
                "inline-flex w-auto min-h-10 items-center gap-2 px-4 py-2"
              )}
              aria-pressed={active}
            >
              <span>{t(FILTER_LABEL_KEYS[f])}</span>
              <span
                className={cn(
                  "inline-flex min-w-[1.25rem] items-center justify-center rounded-full px-1.5 py-0.5 text-[11px] font-bold tabular-nums",
                  active ? "bg-[#E06737]/15 text-[#E06737]" : "bg-[#F1F5F9] text-[#64748B]"
                )}
              >
                {count}
              </span>
            </button>
          );
        })}
      </div>

      <div className="border-t border-[#E2E8F0] bg-[#F8FAFC] px-4 py-2.5 text-xs text-muted-foreground">
        {t("equipmentTab.resultsCount", { shown: shownCount, total: totalCount })}
      </div>
    </div>
  );
}
