import type { UserEquipmentDoc, UserEquipmentStatus } from "@/services/equipment/types";

export type EquipmentFilterKey = "all" | UserEquipmentStatus;

export const EQUIPMENT_STATUS_FILTERS: EquipmentFilterKey[] = [
  "all",
  "available",
  "assigned",
  "in_service",
];

export function equipmentCategoryLabelKey(category: string): string {
  const map: Record<string, string> = {
    machine: "equipment.categoryMachine",
    tool: "equipment.categoryTool",
    vehicle: "equipment.categoryVehicle",
    building: "equipment.categoryBuilding",
    other: "equipment.categoryOther",
  };
  return map[category] ?? "equipment.categoryOther";
}

export function equipmentStatusLabelKey(status: UserEquipmentStatus): string {
  switch (status) {
    case "available":
      return "equipmentTab.status.available";
    case "assigned":
      return "equipmentTab.status.assigned";
    case "in_service":
      return "equipmentTab.status.inService";
    case "inactive":
      return "equipmentTab.status.inactive";
    default:
      return "equipmentTab.status.available";
  }
}

export function equipmentStatusBadgeClass(status: UserEquipmentStatus): string {
  switch (status) {
    case "available":
      return "bg-emerald-100 text-emerald-800 border-emerald-200";
    case "assigned":
      return "bg-sky-100 text-sky-800 border-sky-200";
    case "in_service":
      return "bg-amber-100 text-amber-900 border-amber-200";
    case "inactive":
      return "bg-slate-100 text-slate-700 border-slate-200";
    default:
      return "bg-muted text-muted-foreground";
  }
}

export function equipmentMatchesSearch(item: UserEquipmentDoc, q: string): boolean {
  const qLow = q.trim().toLowerCase();
  if (!qLow) return true;
  const blob = [
    item.name,
    item.category,
    item.kind ?? "",
    item.model ?? "",
    item.internalCode ?? "",
    item.locationText ?? "",
    item.serialNumber ?? "",
  ]
    .join(" ")
    .toLowerCase();
  return blob.includes(qLow);
}

export function computeEquipmentStats(items: UserEquipmentDoc[]) {
  let assigned = 0;
  let inService = 0;
  let available = 0;
  for (const row of items) {
    if (row.status === "assigned") assigned += 1;
    if (row.status === "in_service") inService += 1;
    if (row.status === "available") available += 1;
  }
  return { total: items.length, assigned, inService, available };
}

export function computeEquipmentFilterCounts(
  items: UserEquipmentDoc[],
  search: string
): Record<EquipmentFilterKey, number> {
  const matchesSearch = (row: UserEquipmentDoc) => equipmentMatchesSearch(row, search);
  const searched = items.filter(matchesSearch);

  return {
    all: searched.length,
    available: searched.filter((r) => r.status === "available").length,
    assigned: searched.filter((r) => r.status === "assigned").length,
    in_service: searched.filter((r) => r.status === "in_service").length,
    inactive: searched.filter((r) => r.status === "inactive").length,
  };
}

export function formatEquipmentDate(iso: string): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
}

export function formatEquipmentShortDate(iso: string): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleDateString();
  } catch {
    return iso;
  }
}
