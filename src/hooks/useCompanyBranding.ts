"use client";

import { useEffect, useState } from "react";
import { useWorkspace } from "@/context/WorkspaceContext";
import { isCompanyWorkspaceType } from "@/types/workspace";
import { readOrganizationMarketProfile } from "@/lib/market/marketProfileAdapters";
import type { OrganizationMarketInput } from "@/lib/market/marketProfileContract";
import { readOrganizationProfile } from "@/lib/organizationProfile";
import { getFirestoreInstance, doc, getDoc } from "@/lib/firebase";

export function useCompanyBranding() {
  const { activeWorkspace } = useWorkspace();

  const orgId =
    activeWorkspace && isCompanyWorkspaceType(activeWorkspace.type)
      ? (activeWorkspace.orgId ?? activeWorkspace.id)
      : null;

  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const [legalName, setLegalName] = useState<string | null>(null);
  const [organizationMarket, setOrganizationMarket] = useState<OrganizationMarketInput | null>(
    null
  );
  const [loading, setLoading] = useState(!!orgId);

  useEffect(() => {
    if (!orgId) {
      setLogoUrl(null);
      setLegalName(null);
      setOrganizationMarket(null);
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);

    Promise.all([
      readOrganizationProfile(orgId),
      (async () => {
        const db = getFirestoreInstance();
        if (!db) return null;
        const snap = await getDoc(doc(db, "organizations", orgId));
        return snap.exists() ? (snap.data() as Record<string, unknown>) : null;
      })(),
    ])
      .then(([info, orgData]) => {
        if (cancelled) return;
        setLogoUrl(info?.profile?.logoUrl ?? null);
        setLegalName(info?.profile?.legalName ?? null);

        const marketInput: OrganizationMarketInput = {
          countryCode:
            typeof orgData?.countryCode === "string" ? orgData.countryCode : undefined,
          country: typeof orgData?.country === "string" ? orgData.country : undefined,
          currency: typeof orgData?.currency === "string" ? orgData.currency : undefined,
          timezone: typeof orgData?.timezone === "string" ? orgData.timezone : undefined,
          locale: typeof orgData?.locale === "string" ? orgData.locale : undefined,
          defaultLanguage:
            typeof orgData?.defaultLanguage === "string" ? orgData.defaultLanguage : undefined,
          taxProfile:
            orgData?.taxProfile && typeof orgData.taxProfile === "object"
              ? (orgData.taxProfile as OrganizationMarketInput["taxProfile"])
              : undefined,
          legalProfile:
            orgData?.legalProfile && typeof orgData.legalProfile === "object"
              ? (orgData.legalProfile as OrganizationMarketInput["legalProfile"])
              : undefined,
          marketConfigVersion:
            typeof orgData?.marketConfigVersion === "number"
              ? orgData.marketConfigVersion
              : undefined,
          profile: info?.profile
            ? {
                country: info.profile.country,
                countryCode: info.profile.country,
              }
            : undefined,
        };

        setOrganizationMarket(marketInput);
      })
      .catch(() => {
        if (!cancelled) {
          setLogoUrl(null);
          setLegalName(null);
          setOrganizationMarket(null);
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [orgId]);

  const displayName =
    legalName?.trim() || activeWorkspace?.name?.trim() || null;

  const countryCode = organizationMarket
    ? readOrganizationMarketProfile(organizationMarket).resolvedCountryCode
    : null;

  return {
    orgId,
    isCompany: !!orgId,
    logoUrl,
    displayName,
    legalName,
    countryCode,
    organizationMarket,
    loading,
  };
}
