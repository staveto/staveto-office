"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useI18n } from "@/i18n/I18nContext";
import { useWorkspace } from "@/context/WorkspaceContext";

export default function QuotesPage() {
  const { t } = useI18n();
  const { activeWorkspace } = useWorkspace();

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>{t("nav.quotes")}</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground">
            Coming soon. Workspace: {activeWorkspace?.name ?? "—"} (ID: {activeWorkspace?.id ?? "—"})
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
