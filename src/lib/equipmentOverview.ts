import type { UserEquipmentDoc } from "@/services/equipment/types";
import { formatEquipmentShortDate } from "@/components/equipment/equipmentUtils";

/** Operational equipment status used by the Geräte & Fuhrpark board. */
export type EquipmentBoardStatus =
  | "available"
  | "assigned"
  | "in_use"
  | "service"
  | "maintenance_due"
  | "missing"
  | "damaged"
  | "inactive";

export type EquipmentCategoryKey =
  | "vehicle"
  | "tool"
  | "machine"
  | "building"
  | "other";

export type EquipmentBoardFilter =
  | "all"
  | "available"
  | "in_use"
  | "maintenance"
  | "unassigned"
  | "vehicle"
  | "tool"
  | "machine";

export type EquipmentItemViewModel = {
  id: string;
  name: string;
  category: EquipmentCategoryKey;
  subtype?: string;
  code?: string;
  imageUrl?: string;
  status: EquipmentBoardStatus;
  assignedProjectId?: string | null;
  assignedProjectName?: string;
  assignedWorkerName?: string;
  location?: string;
  nextMaintenanceLabel?: string;
  lastMovementLabel?: string;
  /** True when the record has an identifier and a location. */
  hasCompleteData: boolean;
  updatedAt: string;
};

export type EquipmentOverviewViewModel = {
  total: number;
  available: number;
  inUse: number;
  maintenance: number;
  unassigned: number;
  missingData: number;
  items: EquipmentItemViewModel[];
};

const KNOWN_CATEGORIES: EquipmentCategoryKey[] = [
  "vehicle",
  "tool",
  "machine",
  "building",
  "other",
];

function normalizeCategory(raw: string | undefined): EquipmentCategoryKey {
  const value = (raw ?? "other").toLowerCase();
  return (KNOWN_CATEGORIES as string[]).includes(value)
    ? (value as EquipmentCategoryKey)
    : "other";
}

/** Maps the stored equipment status onto the operational board status. */
function toBoardStatus(status: UserEquipmentDoc["status"]): EquipmentBoardStatus {
  switch (status) {
    case "available":
      return "available";
    case "assigned":
      return "in_use";
    case "in_service":
      return "service";
    case "inactive":
      return "inactive";
    default:
      return "available";
  }
}

function toItemViewModel(
  doc: UserEquipmentDoc,
  projectNames?: Map<string, string>
): EquipmentItemViewModel {
  const code = doc.internalCode?.trim() || doc.serialNumber?.trim() || undefined;
  const location = doc.locationText?.trim() || undefined;
  const projectId = doc.assignedProjectId ?? null;
  const assignedProjectName = projectId
    ? projectNames?.get(projectId) || undefined
    : undefined;

  return {
    id: doc.id,
    name: doc.name?.trim() || "",
    category: normalizeCategory(String(doc.category)),
    subtype: doc.kind?.trim() || doc.model?.trim() || undefined,
    code,
    imageUrl: doc.photoUrl || undefined,
    status: toBoardStatus(doc.status),
    assignedProjectId: projectId,
    assignedProjectName,
    location,
    nextMaintenanceLabel: undefined,
    lastMovementLabel: doc.updatedAt ? formatEquipmentShortDate(doc.updatedAt) : undefined,
    hasCompleteData: Boolean(code) && Boolean(location),
    updatedAt: doc.updatedAt ?? "",
  };
}

export function buildEquipmentOverview(
  docs: UserEquipmentDoc[],
  opts?: { projectNames?: Map<string, string> }
): EquipmentOverviewViewModel {
  const items = docs.map((doc) => toItemViewModel(doc, opts?.projectNames));

  let available = 0;
  let inUse = 0;
  let maintenance = 0;
  let unassigned = 0;
  let missingData = 0;

  for (const item of items) {
    if (item.status === "available") available += 1;
    if (item.status === "assigned" || item.status === "in_use") inUse += 1;
    if (item.status === "service" || item.status === "maintenance_due") {
      maintenance += 1;
    }
    if (!item.assignedProjectId) unassigned += 1;
    if (!item.hasCompleteData) missingData += 1;
  }

  return {
    total: items.length,
    available,
    inUse,
    maintenance,
    unassigned,
    missingData,
    items,
  };
}

export function equipmentMatchesBoardFilter(
  item: EquipmentItemViewModel,
  filter: EquipmentBoardFilter
): boolean {
  switch (filter) {
    case "all":
      return true;
    case "available":
      return item.status === "available";
    case "in_use":
      return item.status === "assigned" || item.status === "in_use";
    case "maintenance":
      return item.status === "service" || item.status === "maintenance_due";
    case "unassigned":
      return !item.assignedProjectId;
    case "vehicle":
      return item.category === "vehicle";
    case "tool":
      return item.category === "tool";
    case "machine":
      return item.category === "machine";
    default:
      return true;
  }
}

export function equipmentMatchesBoardSearch(
  item: EquipmentItemViewModel,
  query: string
): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return [
    item.name,
    item.subtype ?? "",
    item.code ?? "",
    item.location ?? "",
    item.assignedProjectName ?? "",
    item.category,
  ]
    .join(" ")
    .toLowerCase()
    .includes(q);
}

export function boardStatusLabelKey(status: EquipmentBoardStatus): string {
  const map: Record<EquipmentBoardStatus, string> = {
    available: "equipmentBoard.status.available",
    assigned: "equipmentBoard.status.assigned",
    in_use: "equipmentBoard.status.inUse",
    service: "equipmentBoard.status.service",
    maintenance_due: "equipmentBoard.status.maintenanceDue",
    missing: "equipmentBoard.status.missing",
    damaged: "equipmentBoard.status.damaged",
    inactive: "equipmentBoard.status.inactive",
  };
  return map[status];
}

export function boardCategoryLabelKey(category: EquipmentCategoryKey): string {
  const map: Record<EquipmentCategoryKey, string> = {
    vehicle: "equipment.categoryVehicle",
    tool: "equipment.categoryTool",
    machine: "equipment.categoryMachine",
    building: "equipment.categoryBuilding",
    other: "equipment.categoryOther",
  };
  return map[category];
}

/** Status badge classes — readable in both light and dark mode (label always shown, never color-only). */
export function boardStatusBadgeClass(status: EquipmentBoardStatus): string {
  switch (status) {
    case "available":
      return "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-[#047857] dark:bg-[#064E3B] dark:text-[#6EE7B7]";
    case "assigned":
    case "in_use":
      return "border-sky-200 bg-sky-50 text-sky-700 dark:border-sky-800 dark:bg-sky-950/50 dark:text-sky-300";
    case "service":
    case "maintenance_due":
      return "border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-800/70 dark:bg-amber-950/40 dark:text-amber-300";
    case "missing":
    case "damaged":
      return "border-red-200 bg-red-50 text-red-700 dark:border-red-900 dark:bg-red-950/40 dark:text-red-300";
    case "inactive":
    default:
      return "border-[#D8E1EA] bg-[#F8FAFC] text-[#64748B] dark:border-[#334155] dark:bg-[#243247] dark:text-[#94A3B8]";
  }
}
