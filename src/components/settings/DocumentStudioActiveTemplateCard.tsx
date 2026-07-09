"use client";

import { FileText, Sparkles } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

type DocumentStudioActiveTemplateCardProps = {
  templateName: string;
  documentTypeLabel: string;
  isDirty: boolean;
  styleDescription: string;
  aiScore?: number;
  t: (key: string) => string;
};

export function DocumentStudioActiveTemplateCard({
  templateName,
  documentTypeLabel,
  isDirty,
  styleDescription,
  aiScore = 82,
  t,
}: DocumentStudioActiveTemplateCardProps) {
  return (
    <div className="shrink-0 border-b border-border bg-gradient-to-br from-[#1D376A]/[0.04] via-background to-[#E06737]/[0.05] px-4 py-4">
      <div className="flex items-start gap-3">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-[#1D376A] text-white shadow-sm">
          <FileText className="size-5" aria-hidden />
        </span>
        <div className="min-w-0 flex-1 space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              {t("settings.documentStudio.activeTemplate.title")}
            </p>
            <Badge
              variant="outline"
              className={cn(
                "text-[10px] font-medium",
                isDirty
                  ? "border-amber-300 bg-amber-50 text-amber-900"
                  : "border-emerald-300 bg-emerald-50 text-emerald-800"
              )}
            >
              {isDirty
                ? t("settings.documentStudio.activeTemplate.statusUnsaved")
                : t("settings.documentStudio.activeTemplate.statusSaved")}
            </Badge>
          </div>
          <h2 className="truncate text-base font-semibold text-foreground">{templateName}</h2>
          <p className="text-sm text-muted-foreground">
            <span className="font-medium text-foreground">
              {t("settings.documentStudio.activeTemplate.documentType")}:
            </span>{" "}
            {documentTypeLabel}
          </p>
          <p className="text-sm leading-relaxed text-muted-foreground">{styleDescription}</p>
        </div>
        <div className="hidden shrink-0 rounded-xl border border-[#1D376A]/15 bg-white/80 px-3 py-2 text-center shadow-sm sm:block">
          <p className="flex items-center justify-center gap-1 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
            <Sparkles className="size-3 text-[#E06737]" aria-hidden />
            {t("settings.documentStudio.activeTemplate.aiScore")}
          </p>
          <p className="mt-0.5 text-xl font-bold tabular-nums text-[#1D376A]">
            {aiScore}
            <span className="text-sm font-medium text-muted-foreground">/100</span>
          </p>
        </div>
      </div>
    </div>
  );
}
