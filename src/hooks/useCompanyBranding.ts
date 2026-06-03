"use client";

import { useEffect, useState } from "react";
import { useWorkspace } from "@/context/WorkspaceContext";
import { isCompanyWorkspaceType } from "@/types/workspace";
import { readOrganizationProfile } from "@/lib/organizationProfile";

export function useCompanyBranding() {
  const { activeWorkspace } = useWorkspace();

  const orgId =
    activeWorkspace && isCompanyWorkspaceType(activeWorkspace.type)
      ? (activeWorkspace.orgId ?? activeWorkspace.id)
      : null;

  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const [legalName, setLegalName] = useState<string | null>(null);
  const [loading, setLoading] = useState(!!orgId);

  useEffect(() => {
    if (!orgId) {
      setLogoUrl(null);
      setLegalName(null);
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);

    readOrganizationProfile(orgId)
      .then((info) => {
        if (cancelled) return;
        setLogoUrl(info?.profile?.logoUrl ?? null);
        setLegalName(info?.profile?.legalName ?? null);
      })
      .catch(() => {
        if (!cancelled) {
          setLogoUrl(null);
          setLegalName(null);
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

  return {
    orgId,
    isCompany: !!orgId,
    logoUrl,
    displayName,
    loading,
  };
}
