"use client";

import { cn } from "@/lib/utils";
import { useI18n } from "@/i18n/I18nContext";
import {
  EQUIPMENT_STATUSES,
  type UserEquipmentStatus,
} from "@/services/equipment/types";
import { eqStatusPill } from "./equipmentFormStyles";

const STATUS_LABEL_KEYS: Record<UserEquipmentStatus, string> = {
  available: "equipmentTab.status.available",
  assigned: "equipmentTab.status.assigned",
  in_service: "equipmentTab.status.inService",
  inactive: "equipmentTab.status.inactive",
};

type EquipmentStatusChipsProps = {
  value: UserEquipmentStatus;
  onChange: (value: UserEquipmentStatus) => void;
  disabled?: boolean;
};

export function EquipmentStatusChips({
  value,
  onChange,
  disabled,
}: EquipmentStatusChipsProps) {
  const { t } = useI18n();

  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
      {EQUIPMENT_STATUSES.map((status) => {
        const active = value === status;
        return (
          <button
            key={status}
            type="button"
            disabled={disabled}
            onClick={() => onChange(status)}
            className={cn(eqStatusPill(active), "disabled:pointer-events-none disabled:opacity-50")}
          >
            {t(STATUS_LABEL_KEYS[status])}
          </button>
        );
      })}
    </div>
  );
}
