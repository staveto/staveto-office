"use client";

import { Suspense } from "react";
import { useWorkspace } from "@/context/WorkspaceContext";
import { useAuth } from "@/context/AuthContext";
import { useI18n } from "@/i18n/I18nContext";
import { useWorkspaceProduct } from "@/hooks/useWorkspaceProduct";
import { isCompanyWorkspaceType } from "@/types/workspace";
import { canViewOperationsDashboard } from "@/lib/operationsPermissions";
import { OperationsDashboard } from "@/components/operations/OperationsDashboard";
import Link from "next/link";
import { Loader2 } from "lucide-react";

export default function OperationsPage() {
  const { t } = useI18n();
  const { user } = useAuth();
  const { activeWorkspace } = useWorkspace();
  const { role, isCompany } = useWorkspaceProduct();

  if (!isCompany || !activeWorkspace || !isCompanyWorkspaceType(activeWorkspace.type)) {
    return (
      <div className="mx-auto max-w-lg rounded-xl border border-border bg-card p-6 text-center">
        <p className="text-sm text-muted-foreground">{t("operations.subtitle")}</p>
        <Link href="/app" className="mt-3 inline-block text-sm font-medium text-primary hover:underline">
          {t("nav.dashboard")}
        </Link>
      </div>
    );
  }

  if (!canViewOperationsDashboard(role)) {
    return (
      <div className="mx-auto max-w-lg rounded-xl border border-border bg-card p-6 text-center">
        <p className="text-sm text-muted-foreground">{t("dashboard.mission.limitedRole")}</p>
      </div>
    );
  }

  if (!user?.id) return null;

  return (
    <Suspense
      fallback={
        <div className="flex min-h-[40vh] items-center justify-center">
          <Loader2 className="size-8 animate-spin text-[#1D376A]" aria-label={t("common.loading")} />
        </div>
      }
    >
      <OperationsDashboard workspace={activeWorkspace} uid={user.id} role={role} t={t} />
    </Suspense>
  );
}
