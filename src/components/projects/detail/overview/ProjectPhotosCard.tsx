"use client";

import { useEffect, useState } from "react";
import { ArrowRight, Camera, ImageIcon, Loader2, Upload } from "lucide-react";
import type { ProjectOverviewViewModel } from "@/lib/projectOverviewViewModel";
import type { ProjectDashboardTab } from "@/lib/projectDashboard";
import type { ProjectDocumentRecord } from "@/services/projects/projectDocuments";
import { resolveProjectDocumentUrl } from "@/lib/projectDocumentPreview";
import { ProjectDocumentPreviewDialog } from "@/components/projects/detail/ProjectDocumentPreviewDialog";
import { Button } from "@/components/ui/button";
import { useI18n } from "@/i18n/I18nContext";
import { cn } from "@/lib/utils";
import { po } from "./poStyles";

type Props = {
  photos: ProjectOverviewViewModel["photos"];
  onNavigate: (tab: ProjectDashboardTab) => void;
};

function PhotoThumb({
  photo,
  className,
  t,
  onOpen,
}: {
  photo: ProjectOverviewViewModel["photos"]["recent"][number];
  className?: string;
  t: (key: string) => string;
  onOpen: (doc: ProjectDocumentRecord) => void;
}) {
  const [url, setUrl] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!photo.storagePath) return;
    let cancelled = false;

    void resolveProjectDocumentUrl(photo)
      .then((resolved) => {
        if (!cancelled) setUrl(resolved);
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });

    return () => {
      cancelled = true;
    };
  }, [photo.storagePath]);

  const previewDoc: ProjectDocumentRecord = {
    id: photo.id,
    projectId: "",
    fileName: photo.fileName,
    mimeType: "image/jpeg",
    storagePath: photo.storagePath,
    createdAt: photo.createdAt,
  };

  return (
    <button
      type="button"
      onClick={() => onOpen(previewDoc)}
      className={cn(
        "block overflow-hidden rounded-lg border border-[var(--po-card-border)] bg-[var(--po-card-muted)]",
        "cursor-pointer transition-all hover:border-[var(--po-primary)]/35 hover:shadow-sm",
        className
      )}
      aria-label={photo.fileName}
    >
      {url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={url} alt={photo.fileName} className="size-full object-cover" />
      ) : failed ? (
        <span className="flex size-full items-center justify-center">
          <ImageIcon className="size-6 text-[var(--po-text-muted)]" />
        </span>
      ) : (
        <span className="flex size-full items-center justify-center">
          <Loader2 className="size-5 animate-spin text-[var(--po-text-muted)]" aria-label={t("common.loading")} />
        </span>
      )}
    </button>
  );
}

export function ProjectPhotosCard({ photos, onNavigate }: Props) {
  const { t } = useI18n();
  const empty = photos.count === 0;
  const [previewDoc, setPreviewDoc] = useState<ProjectDocumentRecord | null>(null);

  return (
    <section className={cn(po.cardCalm, "p-4 sm:p-5")}>
      <div className="mb-3 flex items-start justify-between gap-2">
        <h2 className={cn(po.sectionTitle, "flex items-center gap-2")}>
          <Camera className="size-4" aria-hidden />
          {t("projects.overview.photos.title")}
        </h2>
        {!empty ? (
          <button
            type="button"
            className={po.linkAction}
            onClick={() => onNavigate("documents")}
          >
            {t("projects.overview.photos.viewAll")}
            <ArrowRight className="size-3.5" />
          </button>
        ) : null}
      </div>

      {empty ? (
        <div className="mb-3 flex flex-col items-center justify-center rounded-lg border border-dashed border-[var(--po-card-border)] bg-[var(--po-card-muted)] px-4 py-8 text-center">
          <ImageIcon className="mb-2 size-8 text-[var(--po-text-muted)]" aria-hidden />
          <p className={cn(po.muted, "text-sm")}>{t("projects.overview.photos.empty")}</p>
        </div>
      ) : (
        <div className="mb-3 grid grid-cols-3 gap-2">
          {photos.recent.map((photo) => (
            <PhotoThumb
              key={photo.id}
              photo={photo}
              className="aspect-square min-h-[72px]"
              t={t}
              onOpen={setPreviewDoc}
            />
          ))}
        </div>
      )}

      <Button size="sm" variant="outline" className={po.btnOutline} onClick={() => onNavigate("documents")}>
        <Upload className="mr-1 size-4" />
        {t("projects.overview.photos.upload")}
      </Button>

      <ProjectDocumentPreviewDialog
        doc={previewDoc}
        open={!!previewDoc}
        onOpenChange={(open) => {
          if (!open) setPreviewDoc(null);
        }}
      />
    </section>
  );
}
