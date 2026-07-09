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

function A4MockupPreview({
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
      className="relative mx-auto w-full max-w-[148px] overflow-hidden rounded-sm border border-slate-200 bg-white shadow-md ring-1 ring-black/5"
      style={{ aspectRatio: "210 / 297" }}
      aria-hidden
    >
      <div className="absolute inset-x-0 top-0 h-[3px]" style={{ backgroundColor: accentColor }} />
      <div className="flex h-full flex-col p-2 pt-2.5">
        <div
          className={cn(
            "mb-1.5 flex gap-1",
            centered && "flex-col items-center",
            flipped && "flex-row-reverse"
          )}
        >
          <div
            className="size-4 shrink-0 rounded-sm border border-black/5"
            style={{ backgroundColor: `${primaryColor}33` }}
          />
          <div className={cn("flex-1 space-y-0.5", centered && "w-full")}>
            <div className="h-1 w-4/5 rounded-full bg-slate-200" />
            <div className="h-0.5 w-3/5 rounded-full bg-slate-100" />
          </div>
        </div>
        <div className="mb-1 h-1.5 w-2/5 rounded-sm" style={{ backgroundColor: primaryColor }} />
        <div className="mb-1.5 rounded border border-slate-100 bg-slate-50/80 p-1">
          <div className="h-0.5 w-full rounded-full bg-slate-200" />
          <div className="mt-0.5 h-0.5 w-4/5 rounded-full bg-slate-100" />
        </div>
        <div className="mb-1 grid grid-cols-2 gap-0.5">
          <div className="h-3 rounded-sm border border-emerald-100 bg-emerald-50/80" />
          <div className="h-3 rounded-sm border border-rose-100 bg-rose-50/80" />
        </div>
        <div className="flex-1 space-y-0.5">
          <div className="h-0.5 w-full rounded-full bg-slate-100" />
          <div className="h-0.5 w-full rounded-full bg-slate-100" />
          <div className="h-0.5 w-3/4 rounded-full bg-slate-100" />
        </div>
        <div
          className="mt-auto rounded-sm px-1 py-0.5 text-center"
          style={{ backgroundColor: `${accentColor}22` }}
        >
          <div className="mx-auto h-0.5 w-2/3 rounded-full" style={{ backgroundColor: accentColor }} />
        </div>
      </div>
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-white/20 to-transparent" />
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
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-4xl">
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
                  "flex flex-col overflow-hidden rounded-2xl border bg-card shadow-sm transition-all hover:shadow-md",
                  isActive ? "border-[#E06737] ring-2 ring-[#E06737]/25" : "border-border"
                )}
              >
                <div className="bg-gradient-to-br from-slate-50 to-white px-4 pb-3 pt-4">
                  <A4MockupPreview
                    primaryColor={preset.preview.primaryColor}
                    accentColor={preset.preview.accentColor}
                    headerLayout={preset.preview.headerLayout}
                  />
                </div>
                <div className="flex flex-1 flex-col gap-3 p-4 pt-3">
                  <div className="space-y-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="font-semibold text-foreground">{t(preset.nameKey)}</h3>
                      {isActive ? (
                        <Badge className="bg-[#1D376A] text-[10px] text-white hover:bg-[#1D376A]">
                          {t("settings.documentStudio.gallery.active")}
                        </Badge>
                      ) : null}
                    </div>
                    <p className="text-sm leading-relaxed text-muted-foreground">
                      {t(preset.descriptionKey)}
                    </p>
                    <p className="text-xs font-medium text-[#1D376A]">
                      {t("settings.documentStudio.gallery.bestFor")}: {t(preset.bestForKey)}
                    </p>
                    <div className="flex flex-wrap gap-1.5">
                      {preset.tagKeys.map((tagKey) => (
                        <Badge
                          key={tagKey}
                          variant="secondary"
                          className="text-[10px] font-medium"
                        >
                          {t(tagKey)}
                        </Badge>
                      ))}
                    </div>
                  </div>
                  <Button
                    type="button"
                    size="sm"
                    className="mt-auto w-full bg-[#e06737] text-white hover:bg-[#c95a30]"
                    disabled={!canEdit}
                    onClick={() => {
                      onApply(preset.id);
                      onOpenChange(false);
                    }}
                  >
                    {t("settings.documentStudio.gallery.apply")}
                  </Button>
                </div>
              </article>
            );
          })}
        </div>
      </DialogContent>
    </Dialog>
  );
}
