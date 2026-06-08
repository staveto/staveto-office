export type ServiceRuleStatus = "active" | "paused" | "archived";

export interface ServiceRuleDoc {
  id: string;
  projectId: string;
  equipmentId: string;
  title: string;
  intervalUnit: "weeks" | "months";
  intervalValue: number;
  startFrom?: string | null;
  nextDueAt: string;
  lastServiceAt?: string | null;
  lastGeneratedDueAt?: string | null;
  checklistTemplate?: Array<{ id: string; title: string }>;
  status: ServiceRuleStatus;
  createdAt: string;
  updatedAt: string;
}

export type CreateServiceRuleInput = {
  title: string;
  intervalUnit: "weeks" | "months";
  intervalValue: number;
  checklistTemplate?: Array<{ id: string; title: string }>;
  startFrom?: Date;
};

export type UserEquipmentServiceTaskDoc = {
  id: string;
  title: string;
  status: string;
  dueDate?: string | null;
  serviceRuleId?: string | null;
  subtasks?: Array<{ id: string; title: string; done: boolean; order: number }>;
  isActive?: boolean;
  createdAt?: string;
  updatedAt?: string;
};
