import type { EnabledModulesMap } from "@/lib/enabledModules";

export type IntegrationStatus =
  | "enabled"
  | "disabled"
  | "connected"
  | "not_connected"
  | "coming_soon";

export type IntegrationEntry = {
  status: IntegrationStatus;
  mode?: "server_side" | "oauth";
  connectedAt?: unknown;
  email?: string;
  connectedByUid?: string;
  note?: string;
};

export type OrganizationIntegrations = Record<string, IntegrationEntry>;

export type AppCenterSettings = {
  orgId: string;
  planCode?: string;
  status?: string;
  enabledModules: EnabledModulesMap;
  integrations: OrganizationIntegrations;
};

export type AppCenterStatusBadge =
  | "enabled"
  | "disabled"
  | "connected"
  | "not_connected"
  | "coming_soon"
  | "required";

export type AppCenterAction =
  | "enable"
  | "disable"
  | "connect"
  | "manage"
  | "coming_soon"
  | "none";
