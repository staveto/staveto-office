"use client";

import {
  Card,
  CardContent,
} from "@/components/ui/card";
import { useI18n } from "@/i18n/I18nContext";
import { CompanyWorkspaceSwitchPrompt } from "@/components/dashboard/CompanyWorkspaceSwitchPrompt";

export function PersonalMembersPlaceholder() {
  const { t } = useI18n();

  return (
    <div className="space-y-6">
      <h2 className="text-xl font-semibold">{t("nav.members")}</h2>
      <Card>
        <CardContent className="py-8 space-y-4">
          <p className="text-center text-muted-foreground">{t("members.personalOnly")}</p>
          <CompanyWorkspaceSwitchPrompt variant="banner" />
        </CardContent>
      </Card>
    </div>
  );
}
