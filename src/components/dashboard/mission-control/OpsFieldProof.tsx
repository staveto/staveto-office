"use client";

import Link from "next/link";
import { useMemo } from "react";
import { useI18n } from "@/i18n/I18nContext";
import { cn } from "@/lib/utils";
import { buttonVariants } from "@/components/ui/button";
import { opsCardClassName } from "./opsStyles";
import type { SharedFieldNotePreview } from "@/services/operations/fieldNotesService";
import { snippetFieldNoteText } from "@/services/operations/fieldNotesService";

type OpsFieldProofProps = {
  photos?: number;
  docs?: number;
  openProblems?: number;
  fieldNotes?: number;
  latestFieldNotes?: SharedFieldNotePreview[];
};

function formatNoteTime(iso: string, locale: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const now = new Date();
  const sameDay =
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate();
  if (sameDay) {
    return d.toLocaleTimeString(locale, { hour: "2-digit", minute: "2-digit" });
  }
  return d.toLocaleDateString(locale, { day: "numeric", month: "short" });
}

export function OpsFieldProof({
  photos = 0,
  docs = 0,
  openProblems = 0,
  fieldNotes = 0,
  latestFieldNotes = [],
}: OpsFieldProofProps) {
  const { t, locale } = useI18n();

  const rows = useMemo(
    () => [
      { id: "photos", labelKey: "dashboard.ops.fieldProof.photos", value: photos, accent: false },
      { id: "docs", labelKey: "dashboard.ops.fieldProof.docs", value: docs, accent: false },
      { id: "issues", labelKey: "dashboard.ops.fieldProof.issues", value: openProblems, accent: true },
      {
        id: "notes",
        labelKey: "dashboard.ops.fieldProof.fieldNotes",
        value: fieldNotes,
        accent: true,
      },
    ],
    [photos, docs, openProblems, fieldNotes]
  );

  const previewNotes = fieldNotes > 0 ? latestFieldNotes.slice(0, 2) : [];

  return (
    <section className={cn(opsCardClassName, "flex h-full flex-col p-5")}>
      <h2 className="text-base font-semibold tracking-tight text-foreground">
        {t("dashboard.ops.fieldProof.title")}
      </h2>
      <p className="mt-0.5 text-xs text-muted-foreground">
        {t("dashboard.ops.fieldProof.summary", {
          photos,
          docs,
          issues: openProblems,
          notes: fieldNotes,
        })}
      </p>

      <ul className="mt-3 flex-1 divide-y divide-border dark:divide-white/10" role="list">
        {rows.map((row) => (
          <li key={row.id} className="flex items-center justify-between gap-2 py-2 first:pt-0">
            <span className="text-sm text-foreground">{t(row.labelKey)}</span>
            <span
              className={cn(
                "text-sm font-semibold tabular-nums",
                row.accent && row.value > 0 ? "text-[#e06737]" : "text-muted-foreground"
              )}
            >
              {row.value}
            </span>
          </li>
        ))}
      </ul>

      {previewNotes.length > 0 ? (
        <div className="mt-2 border-t border-border pt-3 dark:border-white/10">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            {t("dashboard.ops.fieldProof.latestNotes")}
          </p>
          <ul className="mt-2 space-y-2" role="list">
            {previewNotes.map((note) => {
              const author = note.createdByName?.trim() || t("dashboard.ops.fieldProof.noteAuthorFallback");
              const timeLabel = formatNoteTime(note.createdAt, locale);
              const meta = [author, timeLabel].filter(Boolean).join(" · ");
              const body = (
                <>
                  <p className="text-xs font-medium text-foreground/90">{meta}</p>
                  {note.projectName ? (
                    <p className="mt-0.5 truncate text-[11px] text-muted-foreground">{note.projectName}</p>
                  ) : null}
                  <p className="mt-1 line-clamp-2 text-sm text-foreground/80">
                    &ldquo;{snippetFieldNoteText(note.text)}&rdquo;
                  </p>
                </>
              );

              if (note.projectId) {
                return (
                  <li key={note.id}>
                    <Link
                      href={`/app/projects/${note.projectId}`}
                      className="block rounded-lg border border-border/80 bg-muted/30 px-3 py-2 transition-colors hover:bg-muted/50 dark:border-white/10 dark:bg-white/5 dark:hover:bg-white/10"
                    >
                      {body}
                    </Link>
                  </li>
                );
              }

              return (
                <li
                  key={note.id}
                  className="rounded-lg border border-border/80 bg-muted/20 px-3 py-2 dark:border-white/10 dark:bg-white/5"
                >
                  {body}
                </li>
              );
            })}
          </ul>
        </div>
      ) : null}

      <Link
        href="/app/projects"
        className={cn(buttonVariants({ variant: "outline", size: "sm" }), "mt-4 w-full justify-center")}
      >
        {t("dashboard.ops.fieldProof.cta")}
      </Link>
    </section>
  );
}
