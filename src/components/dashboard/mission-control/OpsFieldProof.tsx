"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { AlertTriangle, ChevronRight } from "lucide-react";
import { useI18n } from "@/i18n/I18nContext";
import { cn } from "@/lib/utils";
import { buttonVariants } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { opsCardClassName } from "./opsStyles";
import type { SharedFieldNotePreview } from "@/services/operations/fieldNotesService";
import { snippetFieldNoteText } from "@/services/operations/fieldNotesService";
import type { OpenProblemPreview } from "@/services/projects/projectProblemsReadService";

type OpsFieldProofProps = {
  photos?: number;
  docs?: number;
  openProblems?: number;
  openProblemItems?: OpenProblemPreview[];
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
  return d.toLocaleDateString(locale, { day: "numeric", month: "short", year: "numeric" });
}

function priorityBadgeClass(priority: string): string {
  const p = priority.toLowerCase();
  if (p === "high") return "bg-rose-500/15 text-rose-700 dark:text-rose-300";
  if (p === "low") return "bg-muted text-muted-foreground";
  return "bg-amber-500/15 text-amber-800 dark:text-amber-200";
}

export function OpsFieldProof({
  photos = 0,
  docs = 0,
  openProblems = 0,
  openProblemItems = [],
  fieldNotes = 0,
  latestFieldNotes = [],
}: OpsFieldProofProps) {
  const { t, locale } = useI18n();
  const [notesOpen, setNotesOpen] = useState(false);
  const [problemsOpen, setProblemsOpen] = useState(false);

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
  const hasNotes = fieldNotes > 0 && latestFieldNotes.length > 0;
  const hasProblems = openProblems > 0 && openProblemItems.length > 0;
  const previewProblems = hasProblems ? openProblemItems.slice(0, 2) : [];

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
        {rows.map((row) => {
          const isClickableNotes = row.id === "notes" && hasNotes;
          const isClickableIssues = row.id === "issues" && hasProblems;
          const valueNode = (
            <span
              className={cn(
                "text-sm font-semibold tabular-nums",
                row.accent && row.value > 0 ? "text-[#e06737]" : "text-muted-foreground"
              )}
            >
              {row.value}
            </span>
          );

          if (isClickableNotes || isClickableIssues) {
            return (
              <li key={row.id} className="py-2 first:pt-0">
                <button
                  type="button"
                  onClick={() => (row.id === "notes" ? setNotesOpen(true) : setProblemsOpen(true))}
                  aria-haspopup="dialog"
                  className="-mx-2 flex w-[calc(100%+1rem)] items-center justify-between gap-2 rounded-md px-2 py-1 text-left transition-colors hover:bg-muted/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#e06737]/50 dark:hover:bg-white/10"
                >
                  <span className="flex items-center gap-1.5 text-sm font-medium text-foreground">
                    {t(row.labelKey)}
                    <ChevronRight className="size-3.5 text-muted-foreground" aria-hidden />
                  </span>
                  {valueNode}
                </button>
              </li>
            );
          }

          if (row.id === "issues" && openProblems > 0) {
            return (
              <li key={row.id} className="py-2 first:pt-0">
                <Link
                  href="/app/operations"
                  className="-mx-2 flex w-[calc(100%+1rem)] items-center justify-between gap-2 rounded-md px-2 py-1 transition-colors hover:bg-muted/60 dark:hover:bg-white/10"
                >
                  <span className="flex items-center gap-1.5 text-sm font-medium text-foreground">
                    {t(row.labelKey)}
                    <ChevronRight className="size-3.5 text-muted-foreground" aria-hidden />
                  </span>
                  {valueNode}
                </Link>
              </li>
            );
          }

          return (
            <li key={row.id} className="flex items-center justify-between gap-2 py-2 first:pt-0">
              <span className="text-sm text-foreground">{t(row.labelKey)}</span>
              {valueNode}
            </li>
          );
        })}
      </ul>

      {previewProblems.length > 0 ? (
        <div className="mt-2 border-t border-border pt-3 dark:border-white/10">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            {t("dashboard.ops.fieldProof.latestProblems")}
          </p>
          <ul className="mt-2 space-y-2" role="list">
            {previewProblems.map((problem) => (
              <li key={`${problem.projectId}-${problem.id}`}>
                <Link
                  href={`/app/projects/${problem.projectId}?tab=problems&problemId=${problem.id}`}
                  className="block w-full rounded-lg border border-rose-500/20 bg-rose-500/5 px-3 py-2 text-left transition-colors hover:bg-rose-500/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#e06737]/50"
                >
                  <p className="line-clamp-1 text-sm font-medium text-foreground">
                    {problem.shortDescription}
                  </p>
                  <p className="mt-0.5 truncate text-xs text-muted-foreground">{problem.projectName}</p>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

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
              return (
                <li key={note.id}>
                  <button
                    type="button"
                    onClick={() => setNotesOpen(true)}
                    aria-haspopup="dialog"
                    className="block w-full rounded-lg border border-border/80 bg-muted/30 px-3 py-2 text-left transition-colors hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#e06737]/50 dark:border-white/10 dark:bg-white/5 dark:hover:bg-white/10"
                  >
                    <p className="text-xs font-medium text-foreground/90">{meta}</p>
                    {note.projectName ? (
                      <p className="mt-0.5 truncate text-[11px] text-muted-foreground">{note.projectName}</p>
                    ) : null}
                    <p className="mt-1 line-clamp-2 text-sm text-foreground/80">
                      &ldquo;{snippetFieldNoteText(note.text)}&rdquo;
                    </p>
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      ) : null}

      {hasProblems ? (
        <button
          type="button"
          onClick={() => setProblemsOpen(true)}
          className={cn(buttonVariants({ variant: "outline", size: "sm" }), "mt-4 w-full justify-center")}
        >
          {t("dashboard.ops.fieldProof.viewProblems")}
        </button>
      ) : hasNotes ? (
        <button
          type="button"
          onClick={() => setNotesOpen(true)}
          className={cn(buttonVariants({ variant: "outline", size: "sm" }), "mt-4 w-full justify-center")}
        >
          {t("dashboard.ops.fieldProof.viewNotes")}
        </button>
      ) : (
        <Link
          href="/app/projects"
          className={cn(buttonVariants({ variant: "outline", size: "sm" }), "mt-4 w-full justify-center")}
        >
          {t("dashboard.ops.fieldProof.cta")}
        </Link>
      )}

      <Dialog open={problemsOpen} onOpenChange={setProblemsOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="size-4 text-rose-600" aria-hidden />
              {t("dashboard.ops.fieldProof.problemsDialogTitle")}
            </DialogTitle>
            <DialogDescription>{t("dashboard.ops.fieldProof.problemsDialogDescription")}</DialogDescription>
          </DialogHeader>

          {openProblemItems.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">
              {t("dashboard.ops.fieldProof.problemsDialogEmpty")}
            </p>
          ) : (
            <ul className="-mx-1 max-h-[60vh] space-y-2 overflow-y-auto px-1" role="list">
              {openProblemItems.map((problem) => {
                const timeLabel = problem.createdAt
                  ? formatNoteTime(problem.createdAt, locale)
                  : "";
                const author =
                  problem.createdByName?.trim() ||
                  t("dashboard.ops.fieldProof.noteAuthorFallback");
                return (
                  <li key={`${problem.projectId}-${problem.id}`}>
                    <Link
                      href={`/app/projects/${problem.projectId}?tab=problems&problemId=${problem.id}`}
                      onClick={() => setProblemsOpen(false)}
                      className="block rounded-lg border border-rose-500/20 bg-rose-500/5 px-3 py-2.5 transition-colors hover:bg-rose-500/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#e06737]/50"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <p className="min-w-0 flex-1 text-sm font-semibold text-foreground">
                          {problem.shortDescription}
                        </p>
                        <span
                          className={cn(
                            "shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase",
                            priorityBadgeClass(problem.priority)
                          )}
                        >
                          {problem.priority}
                        </span>
                      </div>
                      <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
                        <span className="text-xs text-muted-foreground">
                          {[author, timeLabel, problem.projectName].filter(Boolean).join(" · ")}
                        </span>
                        <span className="inline-flex shrink-0 items-center gap-0.5 text-xs font-medium text-[#e06737]">
                          {t("dashboard.ops.fieldProof.problemResolve")}
                          <ChevronRight className="size-3.5" aria-hidden />
                        </span>
                      </div>
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}

          <Link
            href="/app/operations"
            onClick={() => setProblemsOpen(false)}
            className={cn(buttonVariants({ variant: "outline", size: "sm" }), "w-full justify-center")}
          >
            {t("dashboard.ops.fieldProof.problemsOpenOperations")}
          </Link>
        </DialogContent>
      </Dialog>

      <Dialog open={notesOpen} onOpenChange={setNotesOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{t("dashboard.ops.fieldProof.notesDialogTitle")}</DialogTitle>
            <DialogDescription>
              {t("dashboard.ops.fieldProof.notesDialogDescription")}
            </DialogDescription>
          </DialogHeader>

          {latestFieldNotes.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">
              {t("dashboard.ops.fieldProof.notesDialogEmpty")}
            </p>
          ) : (
            <ul className="-mx-1 max-h-[60vh] space-y-2 overflow-y-auto px-1" role="list">
              {latestFieldNotes.map((note) => {
                const author = note.createdByName?.trim() || t("dashboard.ops.fieldProof.noteAuthorFallback");
                const timeLabel = formatNoteTime(note.createdAt, locale);
                return (
                  <li
                    key={note.id}
                    className="rounded-lg border border-border/80 bg-muted/20 px-3 py-2.5 dark:border-white/10 dark:bg-white/5"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-sm font-semibold text-foreground">{author}</span>
                      {timeLabel ? (
                        <span className="shrink-0 text-xs text-muted-foreground">{timeLabel}</span>
                      ) : null}
                    </div>
                    <p className="mt-1.5 whitespace-pre-wrap break-words text-sm text-foreground/90">
                      {note.text}
                    </p>
                    <div className="mt-2 flex items-center justify-between gap-2">
                      <span className="inline-flex max-w-[60%] items-center truncate rounded-full border border-border bg-background px-2 py-0.5 text-[11px] font-medium text-muted-foreground dark:border-white/10">
                        {note.projectName?.trim() || t("dashboard.ops.fieldProof.noteNoProject")}
                      </span>
                      {note.projectId ? (
                        <Link
                          href={`/app/projects/${note.projectId}`}
                          onClick={() => setNotesOpen(false)}
                          className="inline-flex shrink-0 items-center gap-0.5 text-xs font-medium text-[#e06737] hover:underline"
                        >
                          {t("dashboard.ops.fieldProof.noteOpenProject")}
                          <ChevronRight className="size-3.5" aria-hidden />
                        </Link>
                      ) : null}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </DialogContent>
      </Dialog>
    </section>
  );
}
