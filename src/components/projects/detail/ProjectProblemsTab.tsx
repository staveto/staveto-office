"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertTriangle, CalendarPlus, CheckCircle2, ImageIcon, Loader2, MapPin, User, Wrench } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogTitle,
} from "@/components/ui/dialog";
import { useI18n } from "@/i18n/I18nContext";
import { cn } from "@/lib/utils";
import type { ProjectDoc } from "@/lib/projects";
import {
  listProjectProblems,
  type ProblemDoc,
  type ProblemPhoto,
} from "@/services/projects/projectProblemsReadService";
import {
  isOpenProblem,
  PROBLEM_STATUS_OPTIONS,
  updateProjectProblem,
} from "@/services/projects/projectProblemsService";
import { getStorageInstance, ref, getDownloadURL, ensureAuthTokenReady } from "@/lib/firebase";
import { po } from "./overview/poStyles";

type ProjectProblemsTabProps = {
  project: ProjectDoc;
  initialProblemId?: string | null;
  onProblemIdChange?: (problemId: string | null) => void;
};

function priorityClass(priority: string): string {
  const p = priority.toLowerCase();
  if (p === "high") return "bg-rose-500/15 text-rose-700 dark:text-rose-300";
  if (p === "low") return "bg-muted text-muted-foreground";
  return "bg-amber-500/15 text-amber-800 dark:text-amber-200";
}

function formatWhen(iso: string, locale: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleString(locale, {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function ProblemPhotoThumb({
  photo,
  onPreview,
}: {
  photo: ProblemPhoto;
  onPreview: (url: string) => void;
}) {
  const { t } = useI18n();
  const [url, setUrl] = useState(photo.downloadURL ?? "");
  const [loading, setLoading] = useState(!photo.downloadURL && !!photo.path);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (photo.downloadURL) {
      setUrl(photo.downloadURL);
      setLoading(false);
      setFailed(false);
      return;
    }
    if (!photo.path) {
      setLoading(false);
      setFailed(true);
      return;
    }
    const storage = getStorageInstance();
    if (!storage) {
      setLoading(false);
      setFailed(true);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setFailed(false);
    void getDownloadURL(ref(storage, photo.path))
      .then((u) => {
        if (!cancelled) {
          setUrl(u);
          setFailed(false);
        }
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [photo.downloadURL, photo.path]);

  if (loading) {
    return (
      <div
        className="flex size-24 items-center justify-center rounded-lg bg-muted sm:size-32"
        aria-label={t("common.loading")}
      >
        <Loader2 className="size-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (failed || !url) {
    return (
      <div className="flex size-24 flex-col items-center justify-center gap-1 rounded-lg border border-dashed border-border bg-muted/40 px-2 text-center sm:size-32">
        <ImageIcon className="size-5 text-muted-foreground" aria-hidden />
        <span className="text-[10px] text-muted-foreground">{t("projects.problems.photoFailed")}</span>
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={() => onPreview(url)}
      className="group relative overflow-hidden rounded-lg ring-1 ring-border transition hover:ring-[var(--po-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--po-primary)]"
      aria-label={t("projects.problems.photoOpen")}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={url}
        alt=""
        className="size-24 object-cover sm:size-32"
      />
      <span className="absolute inset-x-0 bottom-0 bg-black/50 py-1 text-[10px] font-medium text-white opacity-0 transition group-hover:opacity-100">
        {t("projects.problems.photoOpen")}
      </span>
    </button>
  );
}

function ProblemPhotoGallery({ photos }: { photos: ProblemPhoto[] }) {
  const { t } = useI18n();
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  if (photos.length === 0) return null;

  return (
    <>
      <div className="mt-4">
        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-[var(--po-text-muted)]">
          {t("projects.problems.photos")}
        </p>
        <div className="flex flex-wrap gap-2">
          {photos.map((ph, i) => (
            <ProblemPhotoThumb
              key={`${ph.path || ph.downloadURL}-${i}`}
              photo={ph}
              onPreview={setPreviewUrl}
            />
          ))}
        </div>
      </div>

      <Dialog open={!!previewUrl} onOpenChange={(open) => !open && setPreviewUrl(null)}>
        <DialogContent className="max-w-3xl border-none bg-black/95 p-2 sm:p-3">
          <DialogTitle className="sr-only">{t("projects.problems.photos")}</DialogTitle>
          {previewUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={previewUrl}
              alt=""
              className="max-h-[80vh] w-full object-contain"
            />
          ) : null}
        </DialogContent>
      </Dialog>
    </>
  );
}

export function ProjectProblemsTab({
  project,
  initialProblemId,
  onProblemIdChange,
}: ProjectProblemsTabProps) {
  const { t, locale } = useI18n();
  const [problems, setProblems] = useState<ProblemDoc[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showClosed, setShowClosed] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(initialProblemId ?? null);
  const [resolutionNote, setResolutionNote] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      await ensureAuthTokenReady();
      const rows = await listProjectProblems(project.id);
      setProblems(rows);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [project.id]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (initialProblemId) setSelectedId(initialProblemId);
  }, [initialProblemId]);

  const visibleProblems = useMemo(
    () =>
      showClosed ? problems : problems.filter((p) => isOpenProblem(p)),
    [problems, showClosed]
  );

  const selected = useMemo(
    () => problems.find((p) => p.id === selectedId) ?? null,
    [problems, selectedId]
  );

  useEffect(() => {
    setResolutionNote(selected?.resolutionNote ?? "");
  }, [selected?.id, selected?.resolutionNote]);

  useEffect(() => {
    if (selectedId || visibleProblems.length === 0) return;
    setSelectedId(visibleProblems[0].id);
    onProblemIdChange?.(visibleProblems[0].id);
  }, [visibleProblems, selectedId, onProblemIdChange]);

  const selectProblem = (id: string) => {
    setSelectedId(id);
    onProblemIdChange?.(id);
  };

  const applyUpdate = async (patch: Parameters<typeof updateProjectProblem>[2]) => {
    if (!selected) return;
    setSaving(true);
    setError(null);
    try {
      await updateProjectProblem(project.id, selected.id, patch);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  };

  const openCount = problems.filter((p) => isOpenProblem(p)).length;

  if (loading) {
    return (
      <div className="flex min-h-[200px] items-center justify-center">
        <Loader2 className="size-6 animate-spin text-[var(--po-primary)]" />
      </div>
    );
  }

  return (
    <div className={cn("grid gap-4 lg:grid-cols-[minmax(0,280px)_1fr]", po.card)}>
      <aside className="rounded-xl border border-[var(--po-card-border)] bg-[var(--po-card)] p-3">
        <div className="mb-3 flex items-center justify-between gap-2">
          <h2 className="text-sm font-semibold text-[var(--po-text-primary)]">
            {t("projects.problems.listTitle")}
            {openCount > 0 ? (
              <span className="ml-1.5 text-[var(--po-primary)]">({openCount})</span>
            ) : null}
          </h2>
          <button
            type="button"
            onClick={() => setShowClosed((v) => !v)}
            className="text-xs font-medium text-[var(--po-primary)] hover:underline"
          >
            {showClosed ? t("projects.problems.hideClosed") : t("projects.problems.showClosed")}
          </button>
        </div>

        {visibleProblems.length === 0 ? (
          <p className="py-6 text-center text-sm text-[var(--po-text-muted)]">
            {t("projects.problems.empty")}
          </p>
        ) : (
          <ul className="space-y-1" role="list">
            {visibleProblems.map((p) => {
              const active = p.id === selectedId;
              return (
                <li key={p.id}>
                  <button
                    type="button"
                    onClick={() => selectProblem(p.id)}
                    className={cn(
                      "w-full rounded-lg border px-3 py-2.5 text-left transition-colors",
                      active
                        ? "border-[var(--po-primary)] bg-[var(--po-primary)]/10"
                        : "border-transparent hover:bg-[var(--po-card-muted)]"
                    )}
                  >
                    <p className="line-clamp-2 text-sm font-medium text-[var(--po-text-primary)]">
                      {p.shortDescription}
                    </p>
                    <div className="mt-1 flex flex-wrap items-center gap-1.5">
                      <span
                        className={cn(
                          "rounded-full px-1.5 py-0.5 text-[10px] font-bold uppercase",
                          priorityClass(String(p.priority))
                        )}
                      >
                        {t(`projects.problems.priority.${String(p.priority).toLowerCase()}` as "projects.problems.priority.low")}
                      </span>
                      <span className="text-[10px] text-[var(--po-text-muted)]">
                        {t(`projects.problems.status.${String(p.status).toLowerCase()}` as "projects.problems.status.open")}
                      </span>
                      {p.photos.length > 0 ? (
                        <span className="inline-flex items-center gap-0.5 text-[10px] text-[var(--po-text-muted)]">
                          <ImageIcon className="size-3" aria-hidden />
                          {p.photos.length}
                        </span>
                      ) : null}
                    </div>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </aside>

      <section className="rounded-xl border border-[var(--po-card-border)] bg-[var(--po-card)] p-4 sm:p-5">
        {!selected ? (
          <p className="py-12 text-center text-sm text-[var(--po-text-muted)]">
            {t("projects.problems.selectHint")}
          </p>
        ) : (
          <>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <AlertTriangle className="size-4 shrink-0 text-rose-600" aria-hidden />
                  <h3 className="text-lg font-semibold text-[var(--po-text-primary)]">
                    {selected.shortDescription}
                  </h3>
                </div>
                <p className="mt-1 text-xs text-[var(--po-text-muted)]">
                  {[
                    selected.createdByName,
                    formatWhen(selected.createdAt, locale),
                    selected.location,
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                </p>
                <div className="mt-2 flex flex-wrap gap-2 text-xs text-[var(--po-text-secondary)]">
                  {selected.category ? (
                    <span className="inline-flex items-center gap-1 rounded-full border border-[var(--po-card-border)] px-2 py-0.5">
                      {t(`projects.problems.category.${selected.category}` as "projects.problems.category.other")}
                    </span>
                  ) : null}
                  {selected.assigneeName || selected.assigneeUid ? (
                    <span className="inline-flex items-center gap-1">
                      <User className="size-3.5" aria-hidden />
                      {selected.assigneeName || selected.assigneeUid}
                    </span>
                  ) : null}
                  {selected.location ? (
                    <span className="inline-flex items-center gap-1">
                      <MapPin className="size-3.5" aria-hidden />
                      {selected.location}
                    </span>
                  ) : null}
                </div>
              </div>
              <span
                className={cn(
                  "rounded-full px-2.5 py-1 text-xs font-bold uppercase",
                  priorityClass(String(selected.priority))
                )}
              >
                {t(`projects.problems.priority.${String(selected.priority).toLowerCase()}` as "projects.problems.priority.low")}
              </span>
            </div>

            {selected.detail ? (
              <p className="mt-4 whitespace-pre-wrap text-sm text-[var(--po-text-secondary)]">
                {selected.detail}
              </p>
            ) : null}

            {selected.photos.length > 0 ? (
              <ProblemPhotoGallery photos={selected.photos} />
            ) : (
              <p className="mt-4 text-sm text-[var(--po-text-muted)]">{t("projects.problems.noPhotos")}</p>
            )}

            <div className="mt-6 space-y-4 border-t border-[var(--po-card-border)] pt-4">
              <div>
                <label htmlFor="problem-status" className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-[var(--po-text-muted)]">
                  {t("projects.problems.statusLabel")}
                </label>
                <select
                  id="problem-status"
                  value={String(selected.status)}
                  disabled={saving}
                  onChange={(e) => void applyUpdate({ status: e.target.value })}
                  className="h-10 w-full max-w-xs rounded-lg border border-[var(--po-card-border)] bg-background px-3 text-sm"
                >
                  {PROBLEM_STATUS_OPTIONS.map((status) => (
                    <option key={status} value={status}>
                      {t(`projects.problems.status.${status}` as "projects.problems.status.open")}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label htmlFor="problem-resolution" className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-[var(--po-text-muted)]">
                  {t("projects.problems.resolutionNote")}
                </label>
                <textarea
                  id="problem-resolution"
                  value={resolutionNote}
                  onChange={(e) => setResolutionNote(e.target.value)}
                  rows={3}
                  placeholder={t("projects.problems.resolutionPlaceholder")}
                  className="w-full rounded-lg border border-[var(--po-card-border)] bg-background px-3 py-2 text-sm"
                />
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="mt-2"
                  disabled={saving}
                  onClick={() => void applyUpdate({ resolutionNote: resolutionNote.trim() || null })}
                >
                  {saving ? <Loader2 className="size-4 animate-spin" /> : null}
                  {t("projects.problems.saveResolution")}
                </Button>
              </div>

              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  size="sm"
                  disabled={saving || String(selected.status) === "in_progress"}
                  onClick={() => void applyUpdate({ status: "in_progress" })}
                >
                  <Wrench className="size-4" aria-hidden />
                  {t("projects.problems.actionStartFix")}
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="secondary"
                  disabled={saving}
                  onClick={() => void applyUpdate({ status: "fixed" })}
                >
                  <CheckCircle2 className="size-4" aria-hidden />
                  {t("projects.problems.actionMarkFixed")}
                </Button>
                <Link href={`/app/projects/${project.id}?tab=tasks`}>
                  <Button type="button" size="sm" variant="outline">
                    {t("projects.problems.actionCreateTask")}
                  </Button>
                </Link>
                <Link href="/app/planning">
                  <Button type="button" size="sm" variant="outline">
                    <CalendarPlus className="size-4" aria-hidden />
                    {t("projects.problems.actionPlanWork")}
                  </Button>
                </Link>
              </div>
            </div>
          </>
        )}

        {error ? (
          <p className="mt-4 text-sm text-destructive" role="alert">
            {error}
          </p>
        ) : null}
      </section>
    </div>
  );
}
