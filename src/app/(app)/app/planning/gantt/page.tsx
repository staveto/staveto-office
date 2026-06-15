"use client";

import { Suspense } from "react";
import Link from "next/link";
import { Loader2 } from "lucide-react";
import { useI18n } from "@/i18n/I18nContext";
import { useWorkspaceProduct } from "@/hooks/useWorkspaceProduct";
import { GanttPlanningPage } from "@/components/planning/GanttPlanningPage";

export default function GanttPlanningRoutePage() {
  const { t } = useI18n();
  const { isCompany } = useWorkspaceProduct();

  if (!isCompany) {
    return (
      <div className="mx-auto max-w-lg rounded-xl border border-border bg-card p-6 text-center">
        <p className="text-sm text-muted-foreground">{t("planning.personalWorkspaceHint")}</p>
        <Link href="/app" className="mt-3 inline-block text-sm font-medium text-primary hover:underline">
          {t("nav.dashboard")}
        </Link>
      </div>
    );
  }

  return (
    <Suspense
      fallback={
        <div className="flex justify-center py-20">
          <Loader2 className="size-8 animate-spin text-[#1D376A]" aria-label={t("i18n.aria.loading")} />
        </div>
      }
    >
      <GanttPlanningPage />
    </Suspense>
  );
}
