"use client";

import Link from "next/link";
import { AlertTriangle, ChevronRight } from "lucide-react";
import type { OperationsAlert } from "@/lib/operationsAlerts";
import { cn } from "@/lib/utils";
import styles from "./operations.module.css";

type Props = {
  alerts: OperationsAlert[];
  t: (key: string, params?: Record<string, string | number>) => string;
};

export function AttentionCenter({ alerts, t }: Props) {
  return (
    <section
      className={cn(
        styles.sectionCard,
        styles.attentionProminent,
        "border-amber-200/80 bg-gradient-to-br from-amber-50/90 to-white dark:from-amber-950/30 dark:to-slate-900"
      )}
    >
      <p className={styles.sectionIntent}>{t("operations.layout.intent.attention")}</p>
      <div className="mb-3 flex items-center gap-2">
        <AlertTriangle className="size-5 text-amber-600" aria-hidden />
        <h2 className="text-base font-extrabold text-amber-900 dark:text-amber-200">
          {t("operations.attention.title")}
        </h2>
      </div>
      {alerts.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t("operations.attention.allClear")}</p>
      ) : (
        <ul className="space-y-1">
          {alerts.map((alert) => (
            <li key={alert.id}>
              <Link href={alert.href} className={styles.attentionRow}>
                <span className="text-sm font-medium text-foreground">
                  {typeof alert.count === "number" ? `${alert.count} ` : ""}
                  {t(alert.labelKey)}
                </span>
                <ChevronRight className="size-4 shrink-0 text-muted-foreground" aria-hidden />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
