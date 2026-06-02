/**
 * Resolve company tenant from hostname (app vs {slug}.staveto.com).
 * No DNS/hosting changes — client-side hostname only.
 */
import type { ActiveWorkspace } from "@/types/workspace";
import {
  getOrganizationBySlug,
  isOrganizationMember,
  type OrganizationWithId,
} from "@/services/organization/organizationService";
import { normalizeWorkspaceSlug } from "@/lib/workspaceSlug";
import { normalizeOrganizationToWorkspace } from "@/services/workspace/workspaceService";

export type TenantHostMode = "app" | "tenant";

export type TenantFromHostname = {
  mode: TenantHostMode;
  /** Normalized company slug when mode is `tenant`. */
  slug?: string;
  hostname: string;
};

export type TenantResolveStatus =
  | "app"
  | "not_found"
  | "access_denied"
  | "resolved";

export type TenantWorkspaceResolution = {
  status: TenantResolveStatus;
  slug?: string;
  organization?: OrganizationWithId;
  workspace?: ActiveWorkspace;
};

const DEFAULT_BASE_DOMAIN =
  process.env.NEXT_PUBLIC_STAVETO_BASE_DOMAIN ?? "staveto.com";

const APP_SUBDOMAINS = new Set(["app", "www"]);

function stripPort(hostname: string): string {
  return hostname.split(":")[0].toLowerCase();
}

export function getBaseDomain(): string {
  return DEFAULT_BASE_DOMAIN;
}

/**
 * Parse hostname into app entry vs company tenant slug.
 */
export function getTenantFromHostname(hostname: string): TenantFromHostname {
  const host = stripPort(hostname);

  if (host === "localhost" || host === "127.0.0.1") {
    return { mode: "app", hostname: host };
  }

  if (host === DEFAULT_BASE_DOMAIN || host === `app.${DEFAULT_BASE_DOMAIN}`) {
    return { mode: "app", hostname: host };
  }

  if (APP_SUBDOMAINS.has(host.split(".")[0] ?? "")) {
    return { mode: "app", hostname: host };
  }

  // Dev: elc.localhost
  if (host.endsWith(".localhost")) {
    const slug = host.slice(0, -".localhost".length);
    const normalized = normalizeWorkspaceSlug(slug);
    if (normalized && !APP_SUBDOMAINS.has(normalized)) {
      return { mode: "tenant", slug: normalized, hostname: host };
    }
    return { mode: "app", hostname: host };
  }

  // Production: elc.staveto.com
  const suffix = `.${DEFAULT_BASE_DOMAIN}`;
  if (host.endsWith(suffix)) {
    const slugPart = host.slice(0, -suffix.length);
    if (slugPart && !slugPart.includes(".")) {
      const normalized = normalizeWorkspaceSlug(slugPart);
      if (normalized && !APP_SUBDOMAINS.has(normalized)) {
        return { mode: "tenant", slug: normalized, hostname: host };
      }
    }
  }

  return { mode: "app", hostname: host };
}

export function getTenantFromWindow(): TenantFromHostname {
  if (typeof window === "undefined") {
    return { mode: "app", hostname: "localhost" };
  }
  return getTenantFromHostname(window.location.hostname);
}

/**
 * Resolve organization workspace for a company subdomain after auth.
 */
export async function resolveTenantWorkspace(
  hostname: string,
  userId: string
): Promise<TenantWorkspaceResolution> {
  const tenant = getTenantFromHostname(hostname);

  if (tenant.mode !== "tenant" || !tenant.slug) {
    return { status: "app" };
  }

  const organization = await getOrganizationBySlug(tenant.slug);
  if (!organization) {
    return { status: "not_found", slug: tenant.slug };
  }

  if (organization.subdomainEnabled === false) {
    return { status: "not_found", slug: tenant.slug };
  }

  const { member, role } = await isOrganizationMember(organization.id, userId);
  if (!member || !role) {
    return {
      status: "access_denied",
      slug: tenant.slug,
      organization,
    };
  }

  const workspace = normalizeOrganizationToWorkspace(
    organization.id,
    organization.name,
    role,
    { ownerUid: organization.ownerUid, memberUid: userId }
  );

  return {
    status: "resolved",
    slug: tenant.slug,
    organization,
    workspace,
  };
}

export function getAppEntryUrl(): string {
  const base = DEFAULT_BASE_DOMAIN;
  if (typeof window !== "undefined" && window.location.hostname.includes("localhost")) {
    return `${window.location.protocol}//localhost:${window.location.port || "3000"}`;
  }
  return `https://app.${base}`;
}
