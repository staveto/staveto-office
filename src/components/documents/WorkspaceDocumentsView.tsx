"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import {
  ExternalLink,
  FileText,
  Image as ImageIcon,
  Loader2,
  RefreshCw,
  Search,
  Upload,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useI18n } from "@/i18n/I18nContext";
import { useAuth } from "@/context/AuthContext";
import { useWorkspace } from "@/context/WorkspaceContext";
import { useWorkspaceProduct } from "@/hooks/useWorkspaceProduct";
import type { ProjectDoc } from "@/lib/projects";
import { uploadProjectDocument } from "@/services/projects/projectDocuments";
import {
  filterDocumentRows,
  listWorkspaceDocuments,
  resolveDocumentDownloadUrl,
  type WorkspaceDocumentRow,
} from "@/services/documents/workspaceDocumentsService";
import { cn } from "@/lib/utils";

type Mode = "documents" | "photos";

type Props = {
  mode: Mode;
};

function PhotoThumb({
  row,
  onOpen,
}: {
  row: WorkspaceDocumentRow;
  onOpen: (row: WorkspaceDocumentRow, url: string) => void;
}) {
  const [url, setUrl] = useState<string | null>(row.previewUrl ?? null);
  const [loading, setLoading] = useState(!row.previewUrl);

  useEffect(() => {
    if (url) return;
    let cancelled = false;
    void resolveDocumentDownloadUrl(row).then((resolved) => {
      if (cancelled) return;
      setUrl(resolved);
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [row, url]);

  return (
    <button
      type="button"
      className="group relative aspect-square overflow-hidden rounded-lg border border-border/70 bg-muted/30 text-left transition hover:border-[#1D376A]/40"
      onClick={() => url && onOpen(row, url)}
      disabled={!url && !loading}
      title={row.fileName}
    >
      {url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={url} alt={row.fileName} className="size-full object-cover" />
      ) : loading ? (
        <span className="flex size-full items-center justify-center">
          <Loader2 className="size-5 animate-spin text-muted-foreground" />
        </span>
      ) : (
        <span className="flex size-full items-center justify-center px-2 text-center text-[10px] text-muted-foreground">
          {row.fileName}
        </span>
      )}
      <span className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/75 to-transparent px-2 py-1.5 text-[10px] text-white opacity-0 transition group-hover:opacity-100">
        {row.projectName}
      </span>
    </button>
  );
}

export function WorkspaceDocumentsView({ mode }: Props) {
  const { t } = useI18n();
  const { user } = useAuth();
  const { activeWorkspace } = useWorkspace();
  const { canManage } = useWorkspaceProduct();
  const [projects, setProjects] = useState<ProjectDoc[]>([]);
  const [rows, setRows] = useState<WorkspaceDocumentRow[]>([]);
  const [projectFilter, setProjectFilter] = useState("");
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [uploadProjectId, setUploadProjectId] = useState("");
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [preview, setPreview] = useState<{ row: WorkspaceDocumentRow; url: string } | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    if (!user?.id || !activeWorkspace) {
      setProjects([]);
      setRows([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const bundle = await listWorkspaceDocuments(activeWorkspace, user.id);
      setProjects(bundle.projects);
      setRows(bundle.rows);
      if (!uploadProjectId && bundle.projects[0]) {
        setUploadProjectId(bundle.projects[0].id);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : t("documents.loadError"));
      setProjects([]);
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [activeWorkspace, user?.id, t]);

  useEffect(() => {
    void load();
  }, [load]);

  const filtered = useMemo(
    () =>
      filterDocumentRows(rows, mode, {
        projectId: projectFilter || undefined,
        query,
      }),
    [rows, mode, projectFilter, query]
  );

  const projectCount = useMemo(() => {
    const ids = new Set(filtered.map((r) => r.projectId));
    return ids.size;
  }, [filtered]);

  const titleKey = mode === "photos" ? "documents.photos.title" : "documents.all.title";
  const subtitleKey =
    mode === "photos" ? "documents.photos.subtitle" : "documents.all.subtitle";
  const emptyKey = mode === "photos" ? "documents.photos.empty" : "documents.all.empty";

  const handleOpen = async (row: WorkspaceDocumentRow) => {
    const url = await resolveDocumentDownloadUrl(row);
    if (url) window.open(url, "_blank", "noopener,noreferrer");
  };

  const handleUpload = async (file: File) => {
    if (!activeWorkspace || !user?.id || !uploadProjectId) return;
    setUploading(true);
    setUploadError(null);
    try {
      await uploadProjectDocument(uploadProjectId, activeWorkspace, user.id, file);
      await load();
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Upload failed";
      setUploadError(
        msg === "FILE_TOO_LARGE" ? t("projects.dashboard.documents.tooLarge") : msg
      );
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="space-y-5">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">{t(titleKey)}</h1>
          <p className="mt-1 text-sm text-muted-foreground">{t(subtitleKey)}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {canManage && projects.length > 0 ? (
            <>
              <select
                value={uploadProjectId}
                onChange={(e) => setUploadProjectId(e.target.value)}
                className="h-9 max-w-[220px] rounded-md border border-border bg-background px-2 text-sm"
                aria-label={t("documents.upload.selectProject")}
              >
                {projects.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
              <input
                ref={inputRef}
                type="file"
                className="hidden"
                accept={mode === "photos" ? "image/*" : ".pdf,.txt,.docx,image/*"}
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) void handleUpload(file);
                  e.target.value = "";
                }}
              />
              <Button
                type="button"
                size="sm"
                className="h-9 bg-[#e06737] hover:bg-[#c9582f]"
                disabled={uploading || !uploadProjectId}
                onClick={() => inputRef.current?.click()}
              >
                {uploading ? (
                  <Loader2 className="mr-2 size-4 animate-spin" />
                ) : (
                  <Upload className="mr-2 size-4" />
                )}
                {t("documents.upload")}
              </Button>
            </>
          ) : null}
          <Button type="button" variant="outline" size="sm" className="h-9" onClick={() => void load()} disabled={loading}>
            <RefreshCw className={cn("mr-2 size-4", loading && "animate-spin")} />
            {t("common.refresh")}
          </Button>
        </div>
      </header>

      {uploadError ? (
        <p className="rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
          {uploadError}
        </p>
      ) : null}
      {error ? (
        <p className="rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
          {error}
        </p>
      ) : null}

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Card className="border-border/70 bg-card/80">
          <CardHeader className="pb-1 pt-3">
            <CardTitle className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              {t("documents.stats.total")}
            </CardTitle>
          </CardHeader>
          <CardContent className="pb-3">
            <p className="text-2xl font-semibold tabular-nums">{loading ? "—" : filtered.length}</p>
          </CardContent>
        </Card>
        <Card className="border-border/70 bg-card/80">
          <CardHeader className="pb-1 pt-3">
            <CardTitle className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              {t("documents.stats.projects")}
            </CardTitle>
          </CardHeader>
          <CardContent className="pb-3">
            <p className="text-2xl font-semibold tabular-nums">{loading ? "—" : projectCount}</p>
          </CardContent>
        </Card>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row">
        <div className="relative min-w-0 flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t("documents.search.placeholder")}
            className="h-10 w-full rounded-md border border-border bg-background pl-9 pr-3 text-sm"
          />
        </div>
        <select
          value={projectFilter}
          onChange={(e) => setProjectFilter(e.target.value)}
          className="h-10 rounded-md border border-border bg-background px-3 text-sm sm:min-w-[220px]"
        >
          <option value="">{t("documents.filter.allProjects")}</option>
          {projects.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
      </div>

      {loading && rows.length === 0 ? (
        <div className="flex justify-center py-20">
          <Loader2 className="size-8 animate-spin text-[#1D376A]/50" aria-label={t("i18n.aria.loading")} />
        </div>
      ) : filtered.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center gap-3 py-14 text-center">
            {mode === "photos" ? (
              <ImageIcon className="size-10 text-muted-foreground/50" aria-hidden />
            ) : (
              <FileText className="size-10 text-muted-foreground/50" aria-hidden />
            )}
            <div>
              <p className="text-sm font-medium text-foreground">{t(emptyKey)}</p>
              <p className="mt-1 text-xs text-muted-foreground">{t("documents.emptyHint")}</p>
            </div>
            {projects.length === 0 ? (
              canManage ? (
                <Link
                  href="/app/projects/new"
                  className="inline-flex h-9 items-center rounded-md bg-[#1D376A] px-4 text-sm font-medium text-white hover:bg-[#162d58]"
                >
                  {t("documents.createJob")}
                </Link>
              ) : null
            ) : (
              canManage ? (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => inputRef.current?.click()}
                  disabled={uploading || !uploadProjectId}
                >
                  <Upload className="mr-2 size-4" />
                  {t("documents.upload")}
                </Button>
              ) : null
            )}
          </CardContent>
        </Card>
      ) : mode === "photos" ? (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
          {filtered.map((row) => (
            <PhotoThumb
              key={`${row.source}-${row.id}`}
              row={row}
              onOpen={(r, url) => setPreview({ row: r, url })}
            />
          ))}
        </div>
      ) : (
        <ul className="divide-y divide-border rounded-xl border border-border bg-card/80">
          {filtered.map((row) => (
            <li
              key={`${row.source}-${row.id}`}
              className="flex flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center"
            >
              <div className="flex min-w-0 flex-1 items-start gap-3">
                <FileText className="mt-0.5 size-5 shrink-0 text-[#1D376A]/70" aria-hidden />
                <div className="min-w-0">
                  <p className="truncate font-medium text-foreground">{row.fileName}</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    <Link href={`/app/projects/${row.projectId}`} className="hover:text-[#e06737]">
                      {row.projectName}
                    </Link>
                    {row.createdAt
                      ? ` · ${new Date(row.createdAt).toLocaleDateString()}`
                      : ""}
                  </p>
                </div>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <Link
                  href={`/app/projects/${row.projectId}`}
                  className="inline-flex h-8 items-center rounded-md border border-border px-3 text-xs font-medium hover:border-[#e06737]/60"
                >
                  {t("documents.openProject")}
                </Link>
                <Button type="button" size="sm" variant="outline" className="h-8" onClick={() => void handleOpen(row)}>
                  <ExternalLink className="mr-1.5 size-3.5" />
                  {t("documents.open")}
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}

      {preview ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4"
          role="dialog"
          aria-modal
          onClick={() => setPreview(null)}
        >
          <div
            className="max-h-[92vh] w-full max-w-4xl overflow-hidden rounded-xl border border-border bg-card p-3"
            onClick={(e) => e.stopPropagation()}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={preview.url}
              alt={preview.row.fileName}
              className="mx-auto max-h-[78vh] w-auto max-w-full object-contain"
            />
            <div className="mt-3 flex flex-wrap items-center justify-between gap-2 px-1">
              <div className="min-w-0">
                <p className="truncate text-sm font-medium">{preview.row.fileName}</p>
                <p className="text-xs text-muted-foreground">
                  {preview.row.projectName}
                  {preview.row.problemTitle ? ` · ${preview.row.problemTitle}` : ""}
                </p>
              </div>
              <div className="flex gap-2">
                {preview.row.source === "problem_photo" ? (
                  <span className="rounded-full bg-[#e06737]/15 px-2.5 py-1 text-[11px] font-medium text-[#e06737]">
                    {t("documents.source.problem")}
                  </span>
                ) : null}
                <Link
                  href={`/app/projects/${preview.row.projectId}`}
                  className="inline-flex h-8 items-center rounded-md bg-[#1D376A] px-3 text-xs font-medium text-white hover:bg-[#162d58]"
                >
                  {t("documents.openProject")}
                </Link>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
