"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import {
  FileText,
  FileType,
  Eye,
  Image as ImageIcon,
  Loader2,
  Paperclip,
  RefreshCw,
  Ruler,
  Upload,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import type { ProjectDoc } from "@/lib/projects";
import { getProject } from "@/lib/projects";
import type { ProjectDocumentRecord } from "@/services/projects/projectDocuments";
import {
  listProjectDocuments,
  uploadProjectDocument,
} from "@/services/projects/projectDocuments";
import { importAiWizardAttachmentsToProjectDetailed } from "@/services/projects/projectAiAttachmentsService";
import { resolveProjectDocumentUrl } from "@/lib/projectDocumentPreview";
import { useWorkspace } from "@/context/WorkspaceContext";
import { useI18n } from "@/i18n/I18nContext";
import { ProjectDocumentPreviewDialog } from "./ProjectDocumentPreviewDialog";
import { takeoffRoute } from "@/lib/takeoff/takeoffMode";
import { po } from "./overview/poStyles";
import { cn } from "@/lib/utils";

type ProjectDocumentsTabProps = {
  project: ProjectDoc;
  documents: ProjectDocumentRecord[];
  userId: string;
  onDocumentsChange: (docs: ProjectDocumentRecord[]) => void;
};

type CategoryKey = "photos" | "documents" | "other";

function categoryOf(doc: ProjectDocumentRecord): CategoryKey {
  const mime = (doc.mimeType ?? "").toLowerCase();
  if (mime.startsWith("image/")) return "photos";
  if (mime === "application/pdf" || mime.includes("word") || mime === "text/plain") {
    return "documents";
  }
  return "other";
}

const CATEGORY_ICON: Record<CategoryKey, typeof FileText> = {
  photos: ImageIcon,
  documents: FileType,
  other: Paperclip,
};

function DocumentThumbnail({
  doc,
  t,
  onOpen,
}: {
  doc: ProjectDocumentRecord;
  t: (key: string) => string;
  onOpen: () => void;
}) {
  const [url, setUrl] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const isImage = (doc.mimeType ?? "").toLowerCase().startsWith("image/");

  useEffect(() => {
    if (!isImage || !doc.storagePath) return;
    let cancelled = false;

    void resolveProjectDocumentUrl(doc)
      .then((resolved) => {
        if (!cancelled) setUrl(resolved);
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });

    return () => {
      cancelled = true;
    };
  }, [doc, isImage]);

  if (!isImage) {
    return <IconFallback doc={doc} />;
  }

  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        onOpen();
      }}
      className="block shrink-0 overflow-hidden rounded-md border border-[var(--po-card-border)] bg-[var(--po-card-muted)]"
      aria-label={t("projects.dashboard.documents.preview")}
    >
      {url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={url} alt={doc.fileName} className="size-16 object-cover sm:size-20" />
      ) : failed ? (
        <span className="flex size-16 items-center justify-center sm:size-20">
          <ImageIcon className="size-5 text-[var(--po-text-muted)]" />
        </span>
      ) : (
        <span
          className="flex size-16 items-center justify-center sm:size-20"
          aria-label={t("common.loading")}
        >
          <Loader2 className="size-5 animate-spin text-muted-foreground" />
        </span>
      )}
    </button>
  );
}

function IconFallback({ doc }: { doc: ProjectDocumentRecord }) {
  const Icon = CATEGORY_ICON[categoryOf(doc)];
  return <Icon className="size-5 shrink-0 text-[var(--po-text-muted)]" />;
}

function canRecoverAiAttachments(project: ProjectDoc): boolean {
  return (
    !!project.createdByAI ||
    !!project.aiDraftId ||
    (project.attachedFileIds?.length ?? 0) > 0 ||
    (project.aiWizardAttachmentPaths?.length ?? 0) > 0
  );
}

export function ProjectDocumentsTab({
  project,
  documents,
  userId,
  onDocumentsChange,
}: ProjectDocumentsTabProps) {
  const { t } = useI18n();
  const { activeWorkspace } = useWorkspace();
  const inputRef = useRef<HTMLInputElement>(null);
  const autoImportAttempted = useRef(false);
  const [uploading, setUploading] = useState(false);
  const [importing, setImporting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [previewDoc, setPreviewDoc] = useState<ProjectDocumentRecord | null>(null);

  const grouped = useMemo(() => {
    const map: Record<CategoryKey, ProjectDocumentRecord[]> = {
      photos: [],
      documents: [],
      other: [],
    };
    for (const doc of documents) map[categoryOf(doc)].push(doc);
    return map;
  }, [documents]);

  const handleImportAiAttachments = useCallback(async () => {
    if (!activeWorkspace) return;
    setImporting(true);
    setError(null);

    const pollForDocuments = window.setInterval(() => {
      void listProjectDocuments(project.id).then((listed) => {
        if (listed.length > 0) {
          window.clearInterval(pollForDocuments);
          onDocumentsChange(listed);
          setImporting(false);
        }
      });
    }, 2000);

    try {
      const listed = await listProjectDocuments(project.id);
      if (listed.length > 0) {
        onDocumentsChange(listed);
        return;
      }

      const freshProject = (await getProject(project.id)) ?? project;
      const { imported, errors } = await importAiWizardAttachmentsToProjectDetailed({
        projectId: project.id,
        workspace: activeWorkspace,
        userId,
        project: freshProject,
      });

      if (imported.length > 0) {
        onDocumentsChange(imported);
        return;
      }

      const afterImport = await listProjectDocuments(project.id);
      if (afterImport.length > 0) {
        onDocumentsChange(afterImport);
        return;
      }

      if (errors.length > 0) {
        if (process.env.NODE_ENV === "development") {
          console.warn("[documents] AI import errors", errors);
        }
        const detail = errors[0]?.trim();
        setError(
          detail
            ? `${t("projects.dashboard.documents.importFailed")} (${detail})`
            : t("projects.dashboard.documents.importFailed")
        );
      } else {
        setError(t("projects.dashboard.documents.importNone"));
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : t("projects.dashboard.documents.importFailed"));
    } finally {
      window.clearInterval(pollForDocuments);
      setImporting(false);
    }
  }, [activeWorkspace, onDocumentsChange, project, t, userId]);

  useEffect(() => {
    if (autoImportAttempted.current || documents.length > 0) return;
    if (!canRecoverAiAttachments(project)) return;
    autoImportAttempted.current = true;
    void handleImportAiAttachments();
  }, [documents.length, handleImportAiAttachments, project]);

  const handleUpload = async (file: File) => {
    if (!activeWorkspace) return;
    setUploading(true);
    setError(null);
    try {
      const record = await uploadProjectDocument(project.id, activeWorkspace, userId, file);
      onDocumentsChange([record, ...documents]);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Upload failed";
      setError(msg === "FILE_TOO_LARGE" ? t("projects.dashboard.documents.tooLarge") : msg);
    } finally {
      setUploading(false);
    }
  };

  const categories: CategoryKey[] = ["documents", "photos", "other"];
  const isEmpty = documents.length === 0;
  const showImport = isEmpty && canRecoverAiAttachments(project);
  const isBusy = importing;

  return (
    <Card className={cn(po.card, "border-[var(--po-card-border)]")}>
      <CardHeader className="flex flex-row items-center justify-between gap-2">
        <CardTitle className={po.title}>
          {t("projects.dashboard.tab.documents")}
        </CardTitle>
        <div className="flex flex-wrap items-center gap-2">
          {showImport ? (
            <Button
              size="sm"
              variant="outline"
              disabled={isBusy || !activeWorkspace}
              onClick={() => void handleImportAiAttachments()}
            >
              {isBusy ? (
                <Loader2 className="mr-1 size-4 animate-spin" />
              ) : (
                <RefreshCw className="mr-1 size-4" />
              )}
              {t("projects.dashboard.documents.importAi")}
            </Button>
          ) : null}
          <div>
            <input
              ref={inputRef}
              type="file"
              className="hidden"
              accept=".pdf,.txt,.docx,image/*"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) void handleUpload(file);
                e.target.value = "";
              }}
            />
            <Button
              size="sm"
              className="bg-[var(--po-primary)] hover:bg-[var(--po-primary-hover)]"
              disabled={uploading || !activeWorkspace}
              onClick={() => inputRef.current?.click()}
            >
              {uploading ? (
                <Loader2 className="mr-1 size-4 animate-spin" />
              ) : (
                <Upload className="mr-1 size-4" />
              )}
              {t("projects.dashboard.documents.upload")}
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-5">
        {importing ? (
          <div className="flex items-center gap-2 rounded-lg border border-[var(--po-card-border)] bg-[var(--po-card-muted)] px-3 py-2 text-sm text-[var(--po-text-muted)]">
            <Loader2 className="size-4 shrink-0 animate-spin text-[var(--po-primary)]" aria-hidden />
            {t("projects.dashboard.documents.importing")}
          </div>
        ) : null}
        {error ? <p className="text-sm text-destructive">{error}</p> : null}

        {isEmpty ? (
          <div className="py-12 text-center text-[var(--po-text-muted)]">
            <FileText className="mx-auto mb-3 size-10 opacity-40" />
            <p className="text-sm">{t("projects.dashboard.documents.empty")}</p>
            {showImport ? (
              <p className="mt-2 text-xs text-[var(--po-text-muted)]">
                {t("projects.dashboard.documents.importAiHint")}
              </p>
            ) : null}
            <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
              {showImport ? (
                <Button
                  size="sm"
                  variant="outline"
                  disabled={isBusy || !activeWorkspace}
                  onClick={() => void handleImportAiAttachments()}
                >
                  {isBusy ? (
                    <Loader2 className="mr-1 size-4 animate-spin" />
                  ) : (
                    <RefreshCw className="mr-1 size-4" />
                  )}
                  {t("projects.dashboard.documents.importAi")}
                </Button>
              ) : null}
              <Button
                size="sm"
                variant="outline"
                disabled={uploading || !activeWorkspace}
                onClick={() => inputRef.current?.click()}
              >
                <Upload className="mr-1 size-4" />
                {t("projects.dashboard.documents.upload")}
              </Button>
            </div>
          </div>
        ) : (
          categories
            .filter((cat) => grouped[cat].length > 0)
            .map((cat) => {
              const Icon = CATEGORY_ICON[cat];
              return (
                <section key={cat} className="space-y-2">
                  <h3 className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-[var(--po-text-muted)]">
                    <Icon className="size-4" />
                    {t(`projects.documents.category.${cat}`)}
                    <span className="tabular-nums">({grouped[cat].length})</span>
                  </h3>
                  <ul className="grid gap-2 sm:grid-cols-2">
                    {grouped[cat].map((doc) => (
                      <li key={doc.id}>
                        <button
                          type="button"
                          onClick={() => setPreviewDoc(doc)}
                          className="flex w-full items-center gap-3 rounded-lg border border-[var(--po-card-border)] px-3 py-2.5 text-left text-sm transition-colors hover:bg-[var(--po-card-muted)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--po-primary)]/50"
                        >
                          {cat === "photos" ? (
                            <DocumentThumbnail doc={doc} t={t} onOpen={() => setPreviewDoc(doc)} />
                          ) : (
                            <Icon className="size-4 shrink-0 text-[var(--po-text-muted)]" />
                          )}
                          <div className="min-w-0 flex-1">
                            <p className="truncate font-medium text-[var(--po-text-primary)]">
                              {doc.fileName}
                            </p>
                            {doc.createdAt ? (
                              <p className="text-xs text-[var(--po-text-muted)]">
                                {new Date(doc.createdAt).toLocaleDateString()}
                              </p>
                            ) : null}
                          </div>
                          <Eye className="size-4 shrink-0 text-[var(--po-text-muted)]" aria-hidden />
                        </button>
                        {(doc.mimeType ?? "").toLowerCase() === "application/pdf" ? (
                          <Link
                            href={takeoffRoute({
                              projectId: project.id,
                              drawingId: doc.id,
                              mode: "project",
                            })}
                            className="mt-1 inline-flex items-center gap-1 text-xs font-medium text-[var(--po-primary)] hover:underline"
                            data-testid={`open-in-takeoff-${doc.id}`}
                          >
                            <Ruler className="size-3.5" aria-hidden />
                            {t("takeoff.openFromDocuments")}
                          </Link>
                        ) : null}
                      </li>
                    ))}
                  </ul>
                </section>
              );
            })
        )}
      </CardContent>
      <ProjectDocumentPreviewDialog
        doc={previewDoc}
        open={!!previewDoc}
        onOpenChange={(open) => {
          if (!open) setPreviewDoc(null);
        }}
      />
    </Card>
  );
}
