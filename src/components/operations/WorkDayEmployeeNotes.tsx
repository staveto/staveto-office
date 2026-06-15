"use client";

import { cn } from "@/lib/utils";
import styles from "./workDay.module.css";

type Props = {
  notes: string[];
  t: (key: string, params?: Record<string, string | number>) => string;
};

export function WorkDayEmployeeNotes({ notes, t }: Props) {
  return (
    <section className={styles.card}>
      <h2 className={cn(styles.sectionTitle, "mb-3")}>{t("workDay.notes.title")}</h2>
      {notes.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t("workDay.notes.empty")}</p>
      ) : (
        <ul className="space-y-3">
          {notes.map((note, i) => (
            <li key={`${i}-${note.slice(0, 24)}`} className="rounded-lg bg-muted/40 p-3 text-sm leading-relaxed">
              {note}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
