"use client";

import { cn } from "@/lib/utils";
import { useI18n } from "@/i18n/I18nContext";
import {
  EQUIPMENT_CATEGORIES,
  type EquipmentCategory,
} from "@/services/equipment/types";
import { eqCategoryPill } from "./equipmentFormStyles";

const CATEGORY_LABEL_KEYS: Record<EquipmentCategory, string> = {
  machine: "equipment.categoryMachine",
  tool: "equipment.categoryTool",
  vehicle: "equipment.categoryVehicle",
  building: "equipment.categoryBuilding",
  other: "equipment.categoryOther",
};

type EquipmentCategoryChipsProps = {
  value: EquipmentCategory;
  onChange: (value: EquipmentCategory) => void;
  disabled?: boolean;
};

export function EquipmentCategoryChips({
  value,
  onChange,
  disabled,
}: EquipmentCategoryChipsProps) {
  const { t } = useI18n();

  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
      {EQUIPMENT_CATEGORIES.map((category) => {
        const active = value === category;
        return (
          <button
            key={category}
            type="button"
            disabled={disabled}
            onClick={() => onChange(category)}
            className={cn(eqCategoryPill(active), "disabled:pointer-events-none disabled:opacity-50")}
          >
            {t(CATEGORY_LABEL_KEYS[category])}
          </button>
        );
      })}
    </div>
  );
}
