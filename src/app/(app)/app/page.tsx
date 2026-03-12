"use client";

import Link from "next/link";
import { FileText, Plus } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useI18n } from "@/i18n/I18nContext";
import { useWorkspace } from "@/context/WorkspaceContext";

export default function OverviewPage() {
  const { t } = useI18n();
  const { activeWorkspace } = useWorkspace();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">{t("dashboard.title")}</h1>
        <p className="text-muted-foreground mt-1">
          {t("dashboard.subtitle")} {activeWorkspace && `(${activeWorkspace.name})`}
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">{t("dashboard.estimates")}</CardTitle>
            <FileText className="size-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">—</p>
            <p className="text-xs text-muted-foreground">
              {t("dashboard.createManage")}
            </p>
            <Link
              href="/estimates/new"
              className="mt-4 flex h-9 w-full items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
            >
              <Plus className="size-4" />
              {t("dashboard.newEstimate")}
            </Link>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
