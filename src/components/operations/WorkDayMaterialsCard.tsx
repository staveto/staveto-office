"use client";

import Link from "next/link";
import type { WorkDayMaterialRow } from "@/lib/workDayReport";
import { cn } from "@/lib/utils";
import styles from "./workDay.module.css";

type Props = {
  materials: WorkDayMaterialRow[];
  t: (key: string, params?: Record<string, string | number>) => string;
};

export function WorkDayMaterialsCard({ materials, t }: Props) {
  return (
    <section className={styles.card}>
      <h2 className={cn(styles.sectionTitle, "mb-3")}>
        {t("workDay.materials.title")} ({materials.length})
      </h2>
      {materials.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t("workDay.materials.empty")}</p>
      ) : (
        <ul className="space-y-2">
          {materials.map((m) => (
            <li
              key={m.id}
              className="flex items-center justify-between gap-3 rounded-lg border border-border/60 px-3 py-2"
            >
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold">{m.name}</p>
                <Link
                  href={`/app/projects/${m.projectId}`}
                  className="text-xs text-[#1D376A] hover:underline"
                >
                  {m.projectName}
                </Link>
              </div>
              <p className="shrink-0 text-sm font-bold tabular-nums">
                {m.quantity} {m.unit}
              </p>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
