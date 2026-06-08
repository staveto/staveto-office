/** User-scoped equipment — Firestore: users/{uid}/equipment/{id}. */

export type EquipmentCategory = "machine" | "tool" | "vehicle" | "building" | "other";

export type UserEquipmentStatus = "available" | "assigned" | "in_service" | "inactive";

export const EQUIPMENT_CATEGORIES: EquipmentCategory[] = [
  "machine",
  "tool",
  "vehicle",
  "building",
  "other",
];

export const EQUIPMENT_STATUSES: UserEquipmentStatus[] = [
  "available",
  "assigned",
  "in_service",
  "inactive",
];

export interface UserEquipmentDoc {
  id: string;
  ownerId: string;
  name: string;
  category: EquipmentCategory | string;
  kind?: string;
  model?: string;
  status: UserEquipmentStatus;
  serialNumber?: string;
  internalCode?: string;
  locationText?: string;
  notes?: string;
  photoUrl?: string;
  photoPath?: string;
  assignedProjectId?: string | null;
  assignedToUserId?: string | null;
  createdAt: string;
  updatedAt: string;
}

export type CreateUserEquipmentInput = {
  name: string;
  category: EquipmentCategory | string;
  kind?: string;
  model?: string;
  serialNumber?: string;
  internalCode?: string;
  locationText?: string;
  notes?: string;
  status?: UserEquipmentStatus;
};

export type UpdateUserEquipmentInput = Partial<
  CreateUserEquipmentInput & {
    status: UserEquipmentStatus;
    photoUrl: string | null;
    photoPath: string | null;
    assignedProjectId: string | null;
    assignedToUserId: string | null;
  }
>;
