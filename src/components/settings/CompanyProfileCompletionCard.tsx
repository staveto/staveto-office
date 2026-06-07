"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { AlertCircle } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useI18n } from "@/i18n/I18nContext";
import { useWorkspace } from "@/context/WorkspaceContext";
import { isCompanyWorkspaceType } from "@/types/workspace";
import { getCompanyProfileFieldLabelKey } from "@/lib/companyProfileCompletion";
import {
  backfillOwnedBusinessOrgs,
  loadCompanyProfileCompletion,
  type CompanyProfileCompletion,
} from "@/services/business/companyProfileCompletionService";

export function CompanyProfileCompletionCard() {
  const { t } = useI18n();
  const { activeWorkspace } = useWorkspace();
  const orgId =
    activeWorkspace && isCompanyWorkspaceType(activeWorkspace.type)
      ? (activeWorkspace.orgId ?? activeWorkspace.id)
      : null;

  const [completion, setCompletion] = useState<CompanyProfileCompletion | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!orgId) {
      setLoading(false);
      setCompletion(null);
      return;
    }

    let cancelled = false;
    setLoading(true);

    (async () => {
      try {
        await backfillOwnedBusinessOrgs(orgId).catch(() => ({ updatedOrgIds: [], skippedOrgIds: [] }));
        const result = await loadCompanyProfileCompletion(orgId);
        if (!cancelled) setCompletion(result);
      } catch {
        if (!cancelled) setCompletion(null);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [orgId]);

  if (!orgId || loading || !completion || completion.isComplete) {
    return null;
  }

  const missingLabels = completion.missingRecommendedFields.map((field) =>
    t(getCompanyProfileFieldLabelKey(field))
  );

  return (
    <Card className="border-amber-200 bg-amber-50/80">
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-base text-amber-950">
          <AlertCircle className="size-4" aria-hidden />
          {t("settings.companyProfile.completionTitle")}
        </CardTitle>
        <CardDescription className="text-amber-900/80">
          {t("settings.companyProfile.completionDescription", {
            percent: completion.completionPercent,
          })}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {missingLabels.length > 0 ? (
          <div>
            <p className="text-xs font-medium text-amber-950 mb-1">
              {t("settings.companyProfile.completionMissing")}
            </p>
            <ul className="text-sm text-amber-900/90 list-disc pl-5 space-y-0.5">
              {missingLabels.map((label) => (
                <li key={label}>{label}</li>
              ))}
            </ul>
          </div>
        ) : null}
        <Link
          href="/app/settings/company"
          className="inline-block text-sm font-medium text-[#e06737] underline hover:text-[#c95a30]"
        >
          {t("settings.companyProfile.completionCta")}
        </Link>
      </CardContent>
    </Card>
  );
}
