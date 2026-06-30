/**
 * Shared workspace contract (web + mobile must stay aligned).
 * Phase 1: logical model only — Firestore collections unchanged.
 */
import type { ActiveWorkspace, WorkspaceRole } from "@/types/workspace";
import { isCompanyWorkspaceType as isCompanyWorkspaceTypeFromTypes } from "@/types/workspace";
import type {
  LegalProfile,
  MarketSource,
  OrganizationMarketInput,
  TaxProfile,
  UserMarketInput,
} from "@/lib/market/marketProfileContract";

/** Canonical solo workspace id (virtual until Phase 2). */
export const SOLO_WORKSPACE_ID = "personal";

/** users/{uid} field for cross-device active workspace persistence. */
export const ACTIVE_WORKSPACE_PROFILE_FIELD = "lastActiveWorkspaceId" as const;

/** Firestore organization-backed company workspace source marker. */
export const COMPANY_WORKSPACE_SOURCE = "organization" as const;

export type WorkspaceKind = "solo" | "company";

/** Product-facing workspace type (legacy Firestore may still use personal/company/team). */
export type WorkspaceType = WorkspaceKind;

/** Maps legacy `personal` → solo for product copy and mobile parity. */
export function toWorkspaceKind(type: ActiveWorkspace["type"] | undefined): WorkspaceKind {
  return isCompanyWorkspaceTypeFromTypes(type) ? "company" : "solo";
}

export function isCompanyWorkspaceType(
  type: ActiveWorkspace["type"] | "team" | undefined
): boolean {
  return isCompanyWorkspaceTypeFromTypes(type);
}

export type ActiveWorkspaceContext = {
  activeWorkspaceId: string;
  activeWorkspaceType: WorkspaceKind;
  activeWorkspaceName: string;
  activeRole: WorkspaceRole | "owner";
  activeCountryCode: string | null;
  activeCurrency: string;
  activeTimezone: string;
  /** Workspace default language for documents (not UI language). @deprecated Use activeDefaultDocumentLanguage. */
  activeLanguage: string | null;
  /** User UI language — independent from workspace country. */
  userPreferredLanguage: string | null;
  activeMarketSource: MarketSource;
  activeLocale: string | null;
  /** Default language for workspace documents (quotes/invoices later). */
  activeDefaultDocumentLanguage: string | null;
  activeTaxProfile: TaxProfile | null;
  activeLegalProfile: LegalProfile | null;
  marketConfigVersion: number;
  marketConfigWarnings: string[];
};

export type WorkspaceLocaleInput = {
  userPreferredLanguage?: string | null;
  /** Legacy solo country — never used for company workspace resolution. */
  primaryCountry?: string | null;
  userTimezone?: string | null;
  userProfile?: UserMarketInput | null;
  organizationProfile?: OrganizationMarketInput | null;
};

export type CompanyWorkspaceLocaleInput = {
  countryCode?: string | null;
  defaultLanguage?: string | null;
  currency?: string | null;
  timezone?: string | null;
};

/** Normalize legal/company names for duplicate detection (web + mobile must match). */
export function normalizeCompanyIdentityName(value: string | null | undefined): string {
  return (value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[,]/g, " ")
    .replace(/\./g, " ")
    .replace(/\s+/g, " ")
    .replace(/\b(spol\s+s\s+r\s+o|s\s+r\s+o)\b/g, " sro ")
    .replace(/\s+/g, " ")
    .trim();
}

export function getSoloWorkspaceDisplayName(firstName?: string | null): string {
  const trimmed = firstName?.trim();
  if (trimmed) return `${trimmed} – moje zákazky`;
  return "Moje zákazky";
}

export function resolveWorkspaceDisplayName(
  workspace: ActiveWorkspace,
  options?: { firstName?: string | null; legalName?: string | null }
): string {
  if (workspace.type === "personal") {
    return getSoloWorkspaceDisplayName(options?.firstName);
  }
  return options?.legalName?.trim() || workspace.name?.trim() || "Firma";
}

/** @deprecated Prefer resolveWorkspaceDisplayName — kept for legacy imports. */
export const getWorkspaceDisplayName = resolveWorkspaceDisplayName;

export function workspaceIdForPersistence(workspace: ActiveWorkspace): string {
  if (workspace.type === "personal") return SOLO_WORKSPACE_ID;
  return workspace.orgId ?? workspace.id;
}

export function isSoloWorkspaceId(id: string | null | undefined): boolean {
  if (!id?.trim()) return false;
  return id.trim() === SOLO_WORKSPACE_ID;
}
