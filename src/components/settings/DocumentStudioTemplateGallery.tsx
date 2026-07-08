"use client";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  DOCUMENT_STUDIO_PRESETS,
  type DocumentStudioPresetId,
} from "@/lib/documents/documentStudioPresets";
import { cn } from "@/lib/utils";

type DocumentStudioTemplateGalleryProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  activePresetId?: DocumentStudioPresetId | null;
  canEdit: boolean;
  t: (key: string) => string;
  onApply: (presetId: DocumentStudioPresetId) => void;
};

function PresetPreviewCard({
  primaryColor,
  accentColor,
  headerLayout,
}: {
  primaryColor: string;
  accentColor: string;
  headerLayout: string;
}) {
  const centered = headerLayout === "centered";
  const flipped = headerLayout === "company-left-logo-right";

  return (
    <div
      className="relative aspect-[210/297] w-full overflow-hidden rounded-md border border-border bg-white shadow-sm"
      aria-hidden
    >
      <div className="h-1.5 w-full" style={{ backgroundColor: accentColor }} />
      <div className="p-2.5 space-y-2">
        <div
          className={cn(
            "flex gap-2",
            centered && "flex-col items-center",
            flipped && "flex-row-reverse"
          )}
        >
          <div
            className="size-6 shrink-0 rounded border border-black/10"
            style={{ backgroundColor: `${primaryColor}22` }}
          />
          <div className={cn("flex-1 space-y-1", centered && "w-full")}>
            <div className="h-1.5 w-3/4 rounded bg-slate-200" />
            <div className="h-1 w-1/2 rounded bg-slate-100" />
          </div>
        </div>
        <div className="h-2 w-2/5 rounded" style={{ backgroundColor: primaryColor }} />
        <div className="space-y-1 pt-1">
          <div className="h-1 w-full rounded bg-slate-100" />
          <div className="h-1 w-full rounded bg-slate-100" />
          <div className="h-1 w-4/5 rounded bg-slate-100" />
        </div>
        <div className="mt-2 rounded border border-slate-200 p-1.5 space-y-1">
          <div className="h-1 w-full rounded bg-slate-100" />
          <div className="h-1 w-full rounded bg-slate-100" />
          <div className="h-1 w-2/3 rounded" style={{ backgroundColor: `${accentColor}55` }} />
        </div>
      </div>
    </div>
  );
}

export function DocumentStudioTemplateGallery({
  open,
  onOpenChange,
  activePresetId,
  canEdit,
  t,
  onApply,
}: DocumentStudioTemplateGalleryProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>{t("settings.documentStudio.gallery.title")}</DialogTitle>
          <DialogDescription>{t("settings.documentStudio.gallery.subtitle")}</DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 sm:grid-cols-2">
          {DOCUMENT_STUDIO_PRESETS.map((preset) => {
            const isActive = activePresetId === preset.id;
            return (
              <article
                key={preset.id}
                className={cn(
                  "flex flex-col rounded-xl border bg-card p-3 transition-colors",
                  isActive ? "border-[#E06737] ring-1 ring-[#E06737]/40" : "border-border"
                )}
              >
                <PresetPreviewCard
                  primaryColor={preset.preview.primaryColor}
                  accentColor={preset.preview.accentColor}
                  headerLayout={preset.preview.headerLayout}
                />
                <div className="mt-3 flex-1 space-y-1">
                  <div className="flex items-center gap-2">
                    <h3 className="font-semibold text-foreground">{t(preset.nameKey)}</h3>
                    {isActive ? (
                      <Badge variant="secondary" className="text-[10px]">
                        {t("settings.documentStudio.gallery.active")}
                      </Badge>
                    ) : null}
                  </div>
                  <p className="text-sm text-muted-foreground">{t(preset.descriptionKey)}</p>
                </div>
                <Button
                  type="button"
                  size="sm"
                  className="mt-3 w-full bg-[#e06737] hover:bg-[#c95a30] text-white"
                  disabled={!canEdit}
                  onClick={() => {
                    onApply(preset.id);
                    onOpenChange(false);
                  }}
                >
                  {t("settings.documentStudio.gallery.apply")}
                </Button>
              </article>
            );
          })}
        </div>
      </DialogContent>
    </Dialog>
  );
}
