"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useI18n } from "@/i18n/I18nContext";

export default function SettingsPage() {
  const { t } = useI18n();

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>{t("nav.settings")}</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground">Settings coming soon.</p>
        </CardContent>
      </Card>
    </div>
  );
}
