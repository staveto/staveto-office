"use client";

import { useState } from "react";
import type { WorkDayPhotoRow } from "@/lib/workDayReport";
import { formatTimeShort } from "@/lib/operationsMetrics";
import { cn } from "@/lib/utils";
import styles from "./workDay.module.css";

type Props = {
  photos: WorkDayPhotoRow[];
  t: (key: string, params?: Record<string, string | number>) => string;
};

export function WorkDayPhotosStrip({ photos, t }: Props) {
  const [preview, setPreview] = useState<WorkDayPhotoRow | null>(null);

  return (
    <section className={styles.card}>
      <h2 className={cn(styles.sectionTitle, "mb-3")}>
        {t("workDay.photos.title")} ({photos.length})
      </h2>
      {photos.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t("workDay.photos.empty")}</p>
      ) : (
        <div className={styles.photoStrip}>
          {photos.map((ph) => (
            <button
              key={`${ph.id}-${ph.source}`}
              type="button"
              className={styles.photoThumb}
              onClick={() => ph.previewUrl && setPreview(ph)}
              disabled={!ph.previewUrl}
              title={ph.fileName}
            >
              {ph.previewUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={ph.previewUrl} alt={ph.fileName} />
              ) : (
                <span className="flex h-full items-center justify-center text-[10px] text-muted-foreground">
                  {ph.fileName.slice(0, 12)}
                </span>
              )}
              {ph.createdAt ? (
                <span className={styles.photoTime}>{formatTimeShort(ph.createdAt)}</span>
              ) : null}
            </button>
          ))}
        </div>
      )}

      {preview?.previewUrl ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
          role="dialog"
          aria-modal
          onClick={() => setPreview(null)}
        >
          <div className="max-h-[90vh] max-w-4xl overflow-hidden rounded-xl bg-card p-2" onClick={(e) => e.stopPropagation()}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={preview.previewUrl}
              alt={preview.fileName}
              className="max-h-[80vh] w-auto max-w-full object-contain"
            />
            <p className="mt-2 px-2 text-sm text-muted-foreground">
              {preview.projectName}
              {preview.createdAt ? ` · ${formatTimeShort(preview.createdAt)}` : ""}
            </p>
          </div>
        </div>
      ) : null}
    </section>
  );
}
