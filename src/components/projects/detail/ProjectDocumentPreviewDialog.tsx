"use client";

import { useEffect, useState } from "react";
import { ExternalLink, FileText, Loader2 } from "lucide-react";
import type { ProjectDocumentRecord } from "@/services/projects/projectDocuments";
import {
  getProjectDocumentPreviewKind,
  resolveProjectDocumentUrl,
} from "@/lib/projectDocumentPreview";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { buttonVariants } from "@/components/ui/button";
import { useI18n } from "@/i18n/I18nContext";

type ProjectDocumentPreviewDialogProps = {
  doc: ProjectDocumentRecord | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

export function ProjectDocumentPreviewDialog({
  doc,
  open,
  onOpenChange,
}: ProjectDocumentPreviewDialogProps) {
  const { t } = useI18n();
  const [url, setUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!open || !doc) {
      setUrl(null);
      setFailed(false);
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setFailed(false);
    setUrl(null);

    void resolveProjectDocumentUrl(doc)
      .then((resolved) => {
        if (cancelled) return;
        if (!resolved) {
          setFailed(true);
          return;
        }
        setUrl(resolved);
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
  }, [doc, open]);

  const kind = doc ? getProjectDocumentPreviewKind(doc.mimeType) : "unsupported";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[92vh] w-full max-w-5xl flex-col gap-0 overflow-hidden p-0 sm:max-w-5xl">
        <DialogHeader className="border-b px-4 py-3 pr-12">
          <DialogTitle className="truncate text-base">{doc?.fileName ?? "—"}</DialogTitle>
          {doc?.createdAt ? (
            <p className="text-xs text-muted-foreground">
              {new Date(doc.createdAt).toLocaleString()}
            </p>
          ) : null}
        </DialogHeader>

        <div className="min-h-[240px] flex-1 overflow-auto bg-muted/20 p-4">
          {loading ? (
            <div className="flex min-h-[320px] items-center justify-center">
              <Loader2 className="size-8 animate-spin text-muted-foreground" aria-label={t("common.loading")} />
            </div>
          ) : failed || !url ? (
            <div className="flex min-h-[320px] flex-col items-center justify-center gap-2 px-4 text-center">
              <FileText className="size-10 text-muted-foreground/50" aria-hidden />
              <p className="text-sm text-muted-foreground">
                {t("projects.dashboard.documents.previewFailed")}
              </p>
            </div>
          ) : kind === "image" ? (
            <div className="flex min-h-[320px] items-center justify-center">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={url}
                alt={doc?.fileName ?? ""}
                className="max-h-[70vh] w-auto max-w-full rounded-lg object-contain shadow-sm"
              />
            </div>
          ) : kind === "pdf" || kind === "text" ? (
            <iframe
              src={url}
              title={doc?.fileName ?? t("projects.dashboard.documents.preview")}
              className="h-[70vh] w-full rounded-lg border border-border bg-background"
            />
          ) : (
            <div className="flex min-h-[320px] flex-col items-center justify-center gap-3 px-4 text-center">
              <FileText className="size-10 text-muted-foreground/50" aria-hidden />
              <p className="max-w-md text-sm text-muted-foreground">
                {t("projects.dashboard.documents.previewUnsupported")}
              </p>
            </div>
          )}
        </div>

        <DialogFooter className="border-t px-4 py-3 sm:justify-between">
          <p className="text-xs text-muted-foreground self-center">
            {t("projects.dashboard.documents.previewHint")}
          </p>
          {url ? (
            <a
              href={url}
              target="_blank"
              rel="noopener noreferrer"
              className={buttonVariants({ size: "sm", variant: "outline" })}
            >
              <ExternalLink className="mr-1.5 size-4" />
              {t("projects.dashboard.documents.openInNewTab")}
            </a>
          ) : null}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
