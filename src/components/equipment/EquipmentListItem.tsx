"use client";

import Link from "next/link";
import { ChevronRight, Hash, MapPin } from "lucide-react";
import { cn } from "@/lib/utils";
import { useI18n } from "@/i18n/I18nContext";
import type { UserEquipmentDoc } from "@/services/equipment";
import { EquipmentThumbnail } from "./EquipmentThumbnail";
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

  const metaParts = [
    t(equipmentCategoryLabelKey(String(item.category))),
    item.kind,
    item.model,
  ].filter(Boolean);

  return (
    <Link
      href={`/app/equipment/${item.id}`}
      className={cn(
        "group relative flex items-center gap-4 rounded-2xl border border-[#E2E8F0] bg-white p-3 sm:p-4",
        "shadow-sm transition-all duration-200",
        "hover:-translate-y-0.5 hover:border-[#1D376A]/25 hover:shadow-md",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#e06737]/50 focus-visible:ring-offset-2"
      )}
    >
      <div
        className={cn(
          "absolute left-0 top-3 bottom-3 w-1 rounded-r-full opacity-0 transition-opacity group-hover:opacity-100",
          item.status === "available" && "bg-emerald-500",
          item.status === "assigned" && "bg-sky-500",
          item.status === "in_service" && "bg-amber-500",
          item.status === "inactive" && "bg-slate-400"
        )}
        aria-hidden
      />

      <EquipmentThumbnail
        name={item.name || t("equipment.unnamed")}
        category={String(item.category)}
        photoUrl={item.photoUrl}
      />

      <div className="min-w-0 flex-1 space-y-2">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <h3 className="text-base font-semibold leading-snug text-[#0F2A4D] group-hover:text-[#1D376A]">
            {item.name || t("equipment.unnamed")}
          </h3>
          <span
            className={cn(
              "inline-flex shrink-0 rounded-full border px-2.5 py-0.5 text-xs font-semibold",
              equipmentStatusBadgeClass(item.status)
            )}
          >
            {t(equipmentStatusLabelKey(item.status))}
          </span>
        </div>

        {metaParts.length > 0 && (
          <p className="text-sm text-muted-foreground line-clamp-2">{metaParts.join(" · ")}</p>
        )}

        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
          {item.internalCode ? (
            <span className="inline-flex items-center gap-1 rounded-md bg-[#F1F5F9] px-2 py-0.5 font-medium text-[#475569]">
              <Hash className="size-3 shrink-0" aria-hidden />
              {item.internalCode}
            </span>
          ) : null}
          {item.assignedProjectId ? (
            <span className="inline-flex items-center gap-1 text-sky-700">
              <MapPin className="size-3 shrink-0" aria-hidden />
              {t("equipmentTab.rowAssignedShort")}
            </span>
          ) : item.locationText ? (
            <span className="inline-flex items-center gap-1">
              <MapPin className="size-3 shrink-0" aria-hidden />
              <span className="truncate max-w-[14rem]">{item.locationText}</span>
            </span>
          ) : null}
        </div>
      </div>

      <span
        className={cn(
          "flex size-9 shrink-0 items-center justify-center rounded-full border border-transparent",
          "text-muted-foreground transition-colors",
          "group-hover:border-[#E2E8F0] group-hover:bg-[#F8FAFC] group-hover:text-[#1D376A]"
        )}
        aria-hidden
      >
        <ChevronRight className="size-5" />
      </span>
    </Link>
  );
}
