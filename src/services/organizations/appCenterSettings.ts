import { doc, setDoc, serverTimestamp } from "@/lib/firebase";
import { getFirestoreInstance } from "@/lib/firebase";
import { getOrganization } from "@/lib/organizations";
import {
  resolveEnabledModules,
  type EnabledModulesMap,
  type EnabledModulesPartial,
} from "@/lib/enabledModules";
import { saveOrganizationEnabledModules } from "@/services/organization/enabledModulesService";
import type {
  AppCenterSettings,
  IntegrationEntry,
  OrganizationIntegrations,
} from "@/lib/appCenterTypes";

const DEFAULT_INTEGRATIONS: OrganizationIntegrations = {
  googleMaps: { status: "not_connected", mode: "server_side" },
  aiInvoiceOcr: { status: "enabled" },
  gmail: { status: "coming_soon" },
};

function mergeIntegrations(
  stored?: OrganizationIntegrations | null
): OrganizationIntegrations {
  const merged: OrganizationIntegrations = { ...DEFAULT_INTEGRATIONS };
  if (stored) {
    for (const [key, value] of Object.entries(stored)) {
      if (value && typeof value === "object") {
        merged[key] = { ...merged[key], ...value };
      }
    }
  }
  return merged;
}

export async function loadAppCenterSettings(orgId: string): Promise<AppCenterSettings> {
  const org = await getOrganization(orgId);
  const enabledModules = resolveEnabledModules(org?.enabledModules ?? null);
  const integrations = mergeIntegrations(
    (org as { integrations?: OrganizationIntegrations } | null)?.integrations
  );

  return {
    orgId,
    planCode: org?.planCode,
    status: org?.status,
    enabledModules,
    integrations,
  };
}

export async function saveIntegrationEntry(
  orgId: string,
  integrationKey: string,
  patch: Partial<IntegrationEntry>
): Promise<OrganizationIntegrations> {
  const db = getFirestoreInstance();
  if (!db) throw new Error("Firestore not configured");

  const current = await loadAppCenterSettings(orgId);
  const nextIntegrations: OrganizationIntegrations = {
    ...current.integrations,
    [integrationKey]: {
      ...current.integrations[integrationKey],
      ...patch,
    },
  };

  await setDoc(
    doc(db, "organizations", orgId),
    {
      integrations: nextIntegrations,
      updatedAt: serverTimestamp(),
    },
    { merge: true }
  );

  return nextIntegrations;
}

export async function toggleAppCenterModule(
  orgId: string,
  moduleKey: keyof EnabledModulesMap,
  enabled: boolean
): Promise<EnabledModulesMap> {
  const patch: EnabledModulesPartial = { [moduleKey]: enabled };
  return saveOrganizationEnabledModules(orgId, patch);
}

export type ServerFeatureProbe = {
  googleMapsConfigured: boolean;
  aiInvoiceOcrAvailable: boolean;
};

/** Client-side probe of server-side features (no API keys exposed). */
export async function probeServerFeatures(): Promise<ServerFeatureProbe> {
  try {
    const res = await fetch("/api/distance");
    if (!res.ok) {
      return { googleMapsConfigured: false, aiInvoiceOcrAvailable: true };
    }
    const data = (await res.json()) as { configured?: boolean; aiInvoiceOcr?: boolean };
    return {
      googleMapsConfigured: data.configured === true,
      aiInvoiceOcrAvailable: data.aiInvoiceOcr !== false,
    };
  } catch {
    return { googleMapsConfigured: false, aiInvoiceOcrAvailable: true };
  }
}
