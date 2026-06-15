"use client";

import { Suspense } from "react";
import { useParams } from "next/navigation";
import { Loader2 } from "lucide-react";
import Link from "next/link";
import { useI18n } from "@/i18n/I18nContext";
import { useWorkspace } from "@/context/WorkspaceContext";
import { useAuth } from "@/context/AuthContext";
import { useWorkspaceProduct } from "@/hooks/useWorkspaceProduct";
import { isCompanyWorkspaceType } from "@/types/workspace";
import { WorkDayDetailPage } from "@/components/operations/WorkDayDetailPage";

function isValidDateYmd(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function WorkDayRouteInner() {
  const params = useParams<{ userId: string; date: string }>();
  const { t } = useI18n();
  const userId = decodeURIComponent(params.userId ?? "");
  const dateYmd = params.date ?? "";

  if (!userId || !isValidDateYmd(dateYmd)) {
    return (
      <div className="mx-auto max-w-lg rounded-xl border border-border bg-card p-6 text-center">
        <p className="text-sm text-muted-foreground">{t("workDay.error.invalidLink")}</p>
        <Link href="/app/operations" className="mt-3 inline-block text-sm font-medium text-primary hover:underline">
          {t("workDay.breadcrumb.operations")}
        </Link>
      </div>
    );
  }

  return <WorkDayDetailPage userId={userId} dateYmd={dateYmd} />;
}

export default function WorkDayPage() {
  const { t } = useI18n();
  const { user } = useAuth();
  const { activeWorkspace } = useWorkspace();
  const { isCompany } = useWorkspaceProduct();

  if (!user?.id || !activeWorkspace) return null;

  if (!isCompany || !isCompanyWorkspaceType(activeWorkspace.type)) {
    return (
      <div className="mx-auto max-w-lg rounded-xl border border-border bg-card p-6 text-center">
        <p className="text-sm text-muted-foreground">{t("workDay.error.companyOnly")}</p>
        <Link href="/app" className="mt-3 inline-block text-sm font-medium text-primary hover:underline">
          {t("nav.dashboard")}
        </Link>
      </div>
    );
  }

  return (
    <Suspense
      fallback={
        <div className="flex min-h-[40vh] items-center justify-center">
          <Loader2 className="size-8 animate-spin text-[#1D376A]" aria-label={t("common.loading")} />
        </div>
      }
    >
      <WorkDayRouteInner />
    </Suspense>
  );
}
