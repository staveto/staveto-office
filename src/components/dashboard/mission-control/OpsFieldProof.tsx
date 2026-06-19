"use client";

import Link from "next/link";
import { useI18n } from "@/i18n/I18nContext";
import { cn } from "@/lib/utils";
import { buttonVariants } from "@/components/ui/button";
import { opsCardClassName } from "./opsStyles";

/**
 * Field proof (photos / documents / issues) is not yet aggregated into the
 * dashboard data layer. Counts are a safe 0 fallback with an honest empty state.
 */
export function OpsFieldProof() {
  const { t } = useI18n();

  const photos = 0;
  const docs = 0;
  const issues = 0;
  const rows = [
    { id: "photos", labelKey: "dashboard.ops.fieldProof.photos", value: photos },
    { id: "docs", labelKey: "dashboard.ops.fieldProof.docs", value: docs },
    { id: "issues", labelKey: "dashboard.ops.fieldProof.issues", value: issues },
  ];

  return (
    <section className={cn(opsCardClassName, "flex h-full flex-col p-5")}>
      <h2 className="text-base font-semibold tracking-tight text-foreground">
        {t("dashboard.ops.fieldProof.title")}
      </h2>
      <p className="mt-0.5 text-xs text-muted-foreground">
        {t("dashboard.ops.fieldProof.summary", { photos, docs, issues })}
      </p>

      <ul className="mt-3 flex-1 divide-y divide-border dark:divide-white/10" role="list">
        {rows.map((row) => (
          <li key={row.id} className="flex items-center justify-between gap-2 py-2 first:pt-0">
            <span className="text-sm text-foreground">{t(row.labelKey)}</span>
            <span className="text-sm font-semibold tabular-nums text-muted-foreground">
              {row.value}
            </span>
          </li>
        ))}
      </ul>

      <Link
        href="/app/projects"
        className={cn(buttonVariants({ variant: "outline", size: "sm" }), "mt-4 w-full justify-center")}
      >
        {t("dashboard.ops.fieldProof.cta")}
      </Link>
    </section>
  );
}
