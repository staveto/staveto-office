"use client";

import Link from "next/link";
import { useI18n } from "@/i18n/I18nContext";
import { cn } from "@/lib/utils";
import { buttonVariants } from "@/components/ui/button";
import type { OpsFinanceRow } from "./opsModel";
import { opsCardClassName } from "./opsStyles";

type OpsFinanceProps = {
  rows: OpsFinanceRow[];
};

export function OpsFinance({ rows }: OpsFinanceProps) {
  const { t } = useI18n();

  const quotes = rows.find((r) => r.id === "quotes")?.value ?? 0;
  const expenses = rows.find((r) => r.id === "expenses")?.value ?? 0;

  return (
    <section className={cn(opsCardClassName, "flex h-full flex-col p-5")}>
      <h2 className="text-base font-semibold tracking-tight text-foreground">
        {t("dashboard.ops.finance.title")}
      </h2>
      <p className="mt-0.5 text-xs text-muted-foreground">
        {t("dashboard.ops.finance.summary", { quotes, expenses })}
      </p>

      <ul className="mt-3 flex-1 divide-y divide-border dark:divide-white/10" role="list">
        {rows.map((row) => (
          <li key={row.id} className="flex items-center justify-between gap-2 py-2 first:pt-0">
            <span className="text-sm text-foreground">{t(row.labelKey)}</span>
            <span
              className={cn(
                "text-sm font-semibold tabular-nums",
                row.emphasize ? "text-[#e06737]" : "text-muted-foreground"
              )}
            >
              {row.value}
            </span>
          </li>
        ))}
      </ul>

      <Link
        href="/app/quotes"
        className={cn(buttonVariants({ variant: "outline", size: "sm" }), "mt-4 w-full justify-center")}
      >
        {t("dashboard.ops.finance.cta")}
      </Link>
    </section>
  );
}
