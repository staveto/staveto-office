"use client";

import {
  Card,
  CardContent,
} from "@/components/ui/card";
import { useI18n } from "@/i18n/I18nContext";
import { CompanyWorkspaceSwitchPrompt } from "@/components/dashboard/CompanyWorkspaceSwitchPrompt";

export function PersonalPlanningPlaceholder() {
  const { t } = useI18n();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-[#1D376A]">{t("planning.title")}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{t("planning.subtitle")}</p>
      </div>
      <Card>
        <CardContent className="py-8 space-y-4">
          <p className="text-center text-muted-foreground">{t("planning.personalWorkspaceHint")}</p>
          <CompanyWorkspaceSwitchPrompt variant="banner" />
        </CardContent>
      </Card>
    </div>
  );
}
