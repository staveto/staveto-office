"use client";

import { toHoursMinutes, type TaskProgressColumn, type TaskProgressItem } from "@/lib/operationsMetrics";

type Props = {
  items: TaskProgressItem[];
  t: (key: string, params?: Record<string, string | number>) => string;
};

const COLUMNS: { key: TaskProgressColumn; labelKey: string }[] = [
  { key: "not_planned", labelKey: "operations.progress.notPlanned" },
  { key: "planned", labelKey: "operations.progress.planned" },
  { key: "in_progress", labelKey: "operations.progress.inWork" },
  { key: "done", labelKey: "operations.progress.done" },
  { key: "blocked", labelKey: "operations.progress.blocked" },
];

export function TaskProgressBoard({ items, t }: Props) {
  return (
    <section className="rounded-xl border border-border bg-card p-4">
      <h3 className="mb-3 text-sm font-semibold">{t("operations.taskProgress")}</h3>
      <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-5">
        {COLUMNS.map((col) => {
          const rows = items.filter((i) => i.column === col.key).slice(0, 8);
          return (
            <div key={col.key} className="rounded-lg border border-border bg-background p-2">
              <p className="mb-2 text-xs font-semibold text-muted-foreground">{t(col.labelKey)}</p>
              <div className="space-y-1.5">
                {rows.length === 0 ? (
                  <p className="text-xs text-muted-foreground">—</p>
                ) : (
                  rows.map((row) => (
                    <article key={row.id} className="rounded-md bg-muted/40 px-2 py-1.5">
                      <p className="line-clamp-1 text-xs font-medium">{row.title}</p>
                      <p className="line-clamp-1 text-[11px] text-muted-foreground">{row.projectName}</p>
                      <p className="text-[11px] text-muted-foreground">
                        {t("operations.investedTime")}: {toHoursMinutes(row.investedMinutes)}
                      </p>
                    </article>
                  ))
                )}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
