"use client";

import { useMemo } from "react";
import { useAuth } from "@/context/AuthContext";
import { useWorkspace } from "@/context/WorkspaceContext";
import { useCompanyBranding } from "@/hooks/useCompanyBranding";
import { buildActiveWorkspaceContext } from "@/lib/workspace/buildActiveWorkspaceContext";
import type { ActiveWorkspaceContext } from "@/lib/workspace/workspaceContract";
import { getSoloWorkspaceDisplayName, SOLO_WORKSPACE_ID } from "@/lib/workspace/workspaceContract";

export function useActiveWorkspaceContext(): ActiveWorkspaceContext & {
  soloDisplayName: string;
} {
  const { user, profile } = useAuth();
  const { activeWorkspace } = useWorkspace();
  const { displayName: companyLegalName, organizationMarket } = useCompanyBranding();

  const firstName = profile?.firstName?.trim() || user?.firstName?.trim() || null;

  return useMemo(() => {
    const workspace = activeWorkspace ?? {
      id: SOLO_WORKSPACE_ID,
      type: "personal" as const,
      name: getSoloWorkspaceDisplayName(firstName),
      role: "owner" as const,
      source: "personal" as const,
      ownerId: user?.id,
    };

    const ctx = buildActiveWorkspaceContext(workspace, {
      firstName,
      userPreferredLanguage: profile?.preferredLanguage ?? null,
      primaryCountry: profile?.primaryCountry ?? null,
      userTimezone: profile?.timezone ?? null,
      userProfile: {
        soloCountryCode: profile?.soloCountryCode ?? null,
        soloCurrency: profile?.soloCurrency ?? null,
        soloTimezone: profile?.soloTimezone ?? null,
        soloLocale: profile?.soloLocale ?? null,
        soloDefaultLanguage: profile?.soloDefaultLanguage ?? null,
        primaryCountry: profile?.primaryCountry ?? null,
      },
      company:
        workspace.type === "company"
          ? {
              legalName: companyLegalName,
            }
          : undefined,
      organizationProfile: workspace.type === "company" ? organizationMarket : undefined,
    });

    return {
      ...ctx,
      soloDisplayName: getSoloWorkspaceDisplayName(firstName),
    };
  }, [
    activeWorkspace,
    companyLegalName,
    firstName,
    organizationMarket,
    profile?.preferredLanguage,
    profile?.primaryCountry,
    profile?.soloCountryCode,
    profile?.soloCurrency,
    profile?.soloDefaultLanguage,
    profile?.soloLocale,
    profile?.soloTimezone,
    profile?.timezone,
    user?.id,
  ]);
}
