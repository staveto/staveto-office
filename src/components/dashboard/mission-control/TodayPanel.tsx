"use client";

import Link from "next/link";
import { useI18n } from "@/i18n/I18nContext";
import { cn } from "@/lib/utils";
import { buttonVariants } from "@/components/ui/button";
import type { OpsView } from "./opsModel";
import { opsCardClassName } from "./opsStyles";

type TodayPanelProps = {
  capacity: OpsView["capacity"];
  showFinance: boolean;
};

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3 py-2 first:pt-0">
      <span className="shrink-0 text-sm text-muted-foreground">{label}</span>
      <span className="min-w-0 truncate text-right text-sm font-medium text-foreground">
        {value}
      </span>
    </div>
  );
}

export function TodayPanel({ capacity, showFinance }: TodayPanelProps) {
  const { t } = useI18n();

  const nowText = capacity.todayTitle ?? t("dashboard.ops.today.noActive");
  const nextText =
    showFinance && capacity.quotes > 0
      ? t("dashboard.ops.today.nextQuotes")
      : t("dashboard.ops.today.nextPlan");

  // Up to 3 most relevant primary actions for the current state.
  const actions: { id: string; labelKey: string; href: string; primary?: boolean }[] = [];
  if (showFinance && capacity.quotes > 0) {
    actions.push({ id: "quotes", labelKey: "dashboard.ops.today.actionQuotes", href: "/app/quotes", primary: true });
  }
  actions.push({ id: "plan", labelKey: "dashboard.ops.today.actionPlan", href: "/app/planning", primary: actions.length === 0 });
  actions.push({ id: "job", labelKey: "dashboard.ops.today.actionJob", href: "/app/projects/new" });

  return (
    <section className={cn(opsCardClassName, "p-5")}>
      <h2 className="mb-3 text-base font-semibold tracking-tight text-foreground">
        {t("dashboard.ops.today.title")}
      </h2>

      <div className="divide-y divide-border dark:divide-white/10">
        <Row label={t("dashboard.ops.today.now")} value={nowText} />
        <Row label={t("dashboard.ops.today.next")} value={nextText} />
        <Row
          label={t("dashboard.ops.today.capacity")}
          value={t("dashboard.ops.today.capacityValue", { count: capacity.workersAvailable })}
        />
        <Row
          label={t("dashboard.ops.today.vehicles")}
          value={t("dashboard.ops.today.vehiclesValue", { count: capacity.vehiclesAvailable })}
        />
      </div>

      <div className="mt-4 flex flex-col gap-2">
        {actions.slice(0, 3).map((action) => (
          <Link
            key={action.id}
            href={action.href}
            className={cn(
              buttonVariants({ variant: action.primary ? "default" : "outline", size: "sm" }),
              "w-full justify-center"
            )}
          >
            {t(action.labelKey)}
          </Link>
        ))}
      </div>
    </section>
  );
}
