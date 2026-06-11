"use client";

import Link from "next/link";
import { AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";
import type { OperationsAlert } from "@/lib/operationsAlerts";

type Props = {
  alerts: OperationsAlert[];
  t: (key: string, params?: Record<string, string | number>) => string;
};

export function AttentionPanel({ alerts, t }: Props) {
  if (alerts.length === 0) return null;

  return (
    <section className="rounded-xl border border-amber-300/50 bg-amber-50/80 px-3 py-2 dark:border-amber-500/30 dark:bg-amber-950/25">
      <div className="mb-1 flex items-center gap-2 text-xs font-semibold text-amber-900 dark:text-amber-200">
        <AlertTriangle className="size-3.5" />
        {t("operations.alerts")}
      </div>
      <ul className="flex flex-wrap gap-1.5">
        {alerts.map((a) => (
          <li key={a.id}>
            <Link
              href={a.href}
              className={cn(
                "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs ring-1 transition-colors",
                a.severity === "critical"
                  ? "bg-rose-100 text-rose-700 ring-rose-200 hover:bg-rose-200 dark:bg-rose-900/40 dark:text-rose-300 dark:ring-rose-600/40"
                  : a.severity === "warning"
                    ? "bg-amber-100 text-amber-800 ring-amber-200 hover:bg-amber-200 dark:bg-amber-900/40 dark:text-amber-200 dark:ring-amber-600/40"
                    : "bg-slate-100 text-slate-700 ring-slate-200 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-200 dark:ring-slate-600/40"
              )}
            >
              <span>{t(a.labelKey)}</span>
              {typeof a.count === "number" ? (
                <span className="rounded-full bg-white/80 px-1 text-[10px] font-semibold dark:bg-black/20">
                  {a.count}
                </span>
              ) : null}
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
