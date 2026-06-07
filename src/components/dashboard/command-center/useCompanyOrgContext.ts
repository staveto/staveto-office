"use client";

import { useEffect, useState } from "react";
import {
  getOrganization,
  type Organization,
} from "@/lib/organizations";
import {
  readOrganizationProfile,
  type OrganizationProfile,
} from "@/lib/organizationProfile";

export function useCompanyOrgContext(orgId: string | undefined) {
  const [org, setOrg] = useState<Organization | null>(null);
  const [profile, setProfile] = useState<OrganizationProfile | null>(null);
  const [loading, setLoading] = useState(!!orgId);

  useEffect(() => {
    if (!orgId) {
      setOrg(null);
      setProfile(null);
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    void (async () => {
      try {
        const [orgDoc, orgProfile] = await Promise.all([
          getOrganization(orgId),
          readOrganizationProfile(orgId),
        ]);
        if (cancelled) return;
        setOrg(orgDoc);
        setProfile(orgProfile?.profile ?? null);
      } catch {
        if (!cancelled) {
          setOrg(null);
          setProfile(null);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [orgId]);

  return { org, profile, loading };
}
