import type { ActiveWorkspace } from "@/types/workspace";
import type { ActiveWorkspaceContext, WorkspaceLocaleInput, CompanyWorkspaceLocaleInput } from "./workspaceContract";
import {
  resolveWorkspaceDisplayName,
  toWorkspaceKind,
  workspaceIdForPersistence,
} from "./workspaceContract";
import type { OrganizationMarketInput, UserMarketInput } from "@/lib/market/marketProfileContract";
import { resolveActiveMarketProfile } from "@/lib/market/resolveActiveMarketProfile";

function buildUserMarketInput(
  options: WorkspaceLocaleInput
): UserMarketInput {
  return {
    ...(options.userProfile ?? {}),
    preferredLanguage: options.userPreferredLanguage ?? options.userProfile?.preferredLanguage,
    primaryCountry: options.userProfile?.primaryCountry ?? options.primaryCountry ?? null,
    timezone: options.userTimezone ?? options.userProfile?.timezone ?? null,
  };
}

function buildOrganizationMarketInput(
  company: (CompanyWorkspaceLocaleInput & { legalName?: string | null }) | undefined,
  organizationProfile?: OrganizationMarketInput | null
): OrganizationMarketInput | null {
  if (!company && !organizationProfile) return null;
  return {
    ...(organizationProfile ?? {}),
    countryCode: organizationProfile?.countryCode ?? company?.countryCode ?? null,
    currency: organizationProfile?.currency ?? company?.currency ?? null,
    timezone: organizationProfile?.timezone ?? company?.timezone ?? null,
    defaultLanguage: organizationProfile?.defaultLanguage ?? company?.defaultLanguage ?? null,
  };
}

export function buildActiveWorkspaceContext(
  workspace: ActiveWorkspace,
  options: WorkspaceLocaleInput & {
    firstName?: string | null;
    company?: CompanyWorkspaceLocaleInput & { legalName?: string | null };
  }
): ActiveWorkspaceContext {
  const kind = toWorkspaceKind(workspace.type);
  const userProfile = buildUserMarketInput(options);
  const organizationProfile =
    kind === "company"
      ? buildOrganizationMarketInput(options.company, options.organizationProfile)
      : null;

  const market = resolveActiveMarketProfile({
    activeWorkspaceType: kind,
    userProfile,
    organizationProfile,
    userPreferredLanguage: options.userPreferredLanguage ?? userProfile.preferredLanguage ?? null,
    userTimezone: options.userTimezone ?? userProfile.timezone ?? null,
  });

  const documentLanguage = market.activeDefaultDocumentLanguage;

  return {
    activeWorkspaceId: workspaceIdForPersistence(workspace),
    activeWorkspaceType: kind,
    activeWorkspaceName: resolveWorkspaceDisplayName(workspace, {
      firstName: options.firstName,
      legalName: options.company?.legalName,
    }),
    activeRole: workspace.role ?? "owner",
    activeCountryCode: market.activeCountryCode,
    activeCurrency: market.activeCurrency,
    activeTimezone: market.activeTimezone,
    activeLanguage: documentLanguage,
    userPreferredLanguage: options.userPreferredLanguage?.trim() || null,
    activeMarketSource: market.activeMarketSource,
    activeLocale: market.activeLocale,
    activeDefaultDocumentLanguage: documentLanguage,
    activeTaxProfile: market.activeTaxProfile,
    activeLegalProfile: market.activeLegalProfile,
    marketConfigVersion: market.marketConfigVersion,
    marketConfigWarnings: market.marketConfigWarnings,
  };
}
