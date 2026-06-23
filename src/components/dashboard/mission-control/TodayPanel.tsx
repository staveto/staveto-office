"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useI18n } from "@/i18n/I18nContext";
import { formatTimerHms } from "@/lib/operationsMetrics";
import { cn } from "@/lib/utils";
import { buttonVariants } from "@/components/ui/button";
import type { OpsLiveWorker, OpsView } from "./opsModel";
import { opsCardClassName, opsToneBadgeClassName } from "./opsStyles";

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

function LiveWorkerCard({ worker }: { worker: OpsLiveWorker }) {
  const { t } = useI18n();
  const [tick, setTick] = useState(0);

  useEffect(() => {
    if (worker.status !== "working") return;
    const id = setInterval(() => setTick((n) => n + 1), 1000);
    return () => clearInterval(id);
  }, [worker.status]);

  void tick;
  const timerLabel =
    typeof worker.timerSeconds === "number" ? formatTimerHms(worker.timerSeconds) : null;

  return (
    <Link
      href={worker.projectId ? `/app/projects/${worker.projectId}` : "/app/operations"}
      className={cn(
        "block rounded-lg border px-3 py-2.5 transition-colors hover:bg-muted/50",
        worker.status === "working"
          ? "border-emerald-500/40 bg-emerald-500/10"
          : "border-amber-500/40 bg-amber-500/10"
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-foreground">{worker.name}</p>
          {worker.projectName ? (
            <p className="mt-0.5 truncate text-xs text-muted-foreground">{worker.projectName}</p>
          ) : null}
        </div>
        <span
          className={cn(
            "shrink-0 rounded-md px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide",
            worker.status === "working"
              ? opsToneBadgeClassName.success
              : opsToneBadgeClassName.warning
          )}
        >
          {worker.status === "working"
            ? t("dashboard.mission.team.status.working")
            : t("dashboard.mission.team.status.paused")}
        </span>
      </div>
      {timerLabel ? (
        <p className="mt-2 font-mono text-lg font-bold tabular-nums text-emerald-700 dark:text-emerald-300">
          {timerLabel}
        </p>
      ) : null}
    </Link>
  );
}

export function TodayPanel({ capacity, showFinance }: TodayPanelProps) {
  const { t } = useI18n();

  const liveWorkers = capacity.liveWorkers;
  const nowText =
    liveWorkers.length > 0
      ? t("dashboard.ops.today.workingCount", { count: liveWorkers.length })
      : (capacity.todayTitle ?? t("dashboard.ops.today.noActive"));
  const nextText =
    showFinance && capacity.quotes > 0
      ? t("dashboard.ops.today.nextQuotes")
      : t("dashboard.ops.today.nextPlan");

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

      {liveWorkers.length > 0 ? (
        <div className="mb-4 space-y-2">
          <p className="text-xs font-semibold uppercase tracking-wider text-emerald-700 dark:text-emerald-300">
            {t("dashboard.ops.today.liveWorkers")}
          </p>
          {liveWorkers.map((worker) => (
            <LiveWorkerCard key={worker.id} worker={worker} />
          ))}
        </div>
      ) : null}

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
