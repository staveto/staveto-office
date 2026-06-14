import { REQUIRED_MODULES, type EnabledModulesMap } from "@/lib/enabledModules";
import type { AppCenterCatalogItem } from "@/lib/appCenterCatalog";
import type {
  AppCenterAction,
  AppCenterStatusBadge,
  OrganizationIntegrations,
} from "@/lib/appCenterTypes";
import type { ServerFeatureProbe } from "@/services/organizations/appCenterSettings";

export type ResolvedAppCard = {
  status: AppCenterStatusBadge;
  action: AppCenterAction;
  statusDetailKey?: string;
};

export function resolveAppCardState(
  item: AppCenterCatalogItem,
  ctx: {
    modules: EnabledModulesMap;
    integrations: OrganizationIntegrations;
    probe: ServerFeatureProbe;
  }
): ResolvedAppCard {
  if (item.comingSoon) {
    return { status: "coming_soon", action: "coming_soon" };
  }

  if (item.moduleKey) {
    const required = item.required || (REQUIRED_MODULES as readonly string[]).includes(item.moduleKey);
    const enabled = ctx.modules[item.moduleKey];
    if (required) {
      return { status: "required", action: "none" };
    }
    return {
      status: enabled ? "enabled" : "disabled",
      action: enabled ? "disable" : "enable",
    };
  }

  if (item.serverSideProbe === "googleMaps") {
    const configured = ctx.probe.googleMapsConfigured;
    const stored = ctx.integrations.googleMaps;
    if (configured) {
      return {
        status: "enabled",
        action: "manage",
        statusDetailKey: "appCenter.status.serverSide",
      };
    }
    return {
      status: stored?.status === "enabled" ? "disabled" : "not_connected",
      action: "manage",
      statusDetailKey: "appCenter.status.notConfigured",
    };
  }

  if (item.serverSideProbe === "aiInvoiceOcr") {
    if (ctx.probe.aiInvoiceOcrAvailable) {
      return {
        status: "enabled",
        action: "manage",
        statusDetailKey: "appCenter.status.serverSide",
      };
    }
    return { status: "not_connected", action: "coming_soon" };
  }

  if (item.integrationKey) {
    const entry = ctx.integrations[item.integrationKey];
    const status = entry?.status ?? "not_connected";
    if (status === "connected") {
      return { status: "connected", action: "manage" };
    }
    if (status === "enabled") {
      return { status: "enabled", action: "manage" };
    }
    if (status === "coming_soon") {
      return { status: "coming_soon", action: "coming_soon" };
    }
    return { status: "not_connected", action: "connect" };
  }

  return { status: "coming_soon", action: "coming_soon" };
}
