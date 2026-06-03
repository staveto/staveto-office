"use client";

import { Building2 } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useI18n } from "@/i18n/I18nContext";
import { useAuth } from "@/context/AuthContext";
import { useWorkspace } from "@/context/WorkspaceContext";
import { userNeedsCompanyRegistration } from "@/services/onboarding";
import { isCompanyWorkspaceType } from "@/types/workspace";

export function CompanyRegistrationPlaceholder() {
  const { t } = useI18n();
  const { profile } = useAuth();
  const { availableWorkspaces } = useWorkspace();

  const hasCompanyWorkspace = availableWorkspaces.some((w) =>
    isCompanyWorkspaceType(w.type)
  );

  if (!userNeedsCompanyRegistration(profile, hasCompanyWorkspace)) {
    return null;
  }

  return (
    <Card className="border-[#1D376A]/15 bg-[#1D376A]/[0.03]">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Building2 className="size-4 text-[#1D376A]" aria-hidden />
          {t("onboarding.pendingCompany.settingsTitle")}
        </CardTitle>
        <CardDescription>{t("onboarding.pendingCompany.settingsDescription")}</CardDescription>
      </CardHeader>
      <CardContent>
        <p className="text-sm text-muted-foreground leading-relaxed">
          {t("onboarding.path.companyOwner.nextStepHint")}
        </p>
      </CardContent>
    </Card>
  );
}
