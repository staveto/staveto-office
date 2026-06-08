"use client";

import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { useI18n } from "@/i18n/I18nContext";
import type { UserEquipmentDoc } from "@/services/equipment";
import {
  equipmentCategoryLabelKey,
  equipmentStatusBadgeClass,
  equipmentStatusLabelKey,
} from "./equipmentUtils";

type EquipmentListItemProps = {
  item: UserEquipmentDoc;
};

export function EquipmentListItem({ item }: EquipmentListItemProps) {
  const { t } = useI18n();

  return (
    <Link
      href={`/app/equipment/${item.id}`}
      className="group flex items-start gap-3 rounded-xl border border-[#E2E8F0] bg-white p-4 transition-colors hover:border-[#1D376A]/30 hover:bg-[#F8FAFC]"
    >
      <div className="min-w-0 flex-1 space-y-1.5">
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="font-semibold text-[#0F2A4D] group-hover:underline">
            {item.name || t("equipment.unnamed")}
          </h3>
          <span
            className={cn(
              "inline-flex rounded-full border px-2.5 py-0.5 text-xs font-medium",
              equipmentStatusBadgeClass(item.status)
            )}
          >
            {t(equipmentStatusLabelKey(item.status))}
          </span>
        </div>
        <p className="text-sm text-muted-foreground">
          {t(equipmentCategoryLabelKey(String(item.category)))}
          {item.kind ? ` · ${item.kind}` : ""}
          {item.model ? ` · ${item.model}` : ""}
        </p>
        {(item.locationText || item.assignedProjectId) && (
          <p className="text-xs text-muted-foreground">
            {item.assignedProjectId
              ? t("equipmentTab.rowAssignedShort")
              : item.locationText}
          </p>
        )}
      </div>
      <ChevronRight className="size-5 shrink-0 text-muted-foreground mt-0.5" />
    </Link>
  );
}
