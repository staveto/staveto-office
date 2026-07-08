"use client";

import { Sparkles, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { CardContent } from "@/components/ui/card";
import { SettingsSectionCard } from "@/components/settings/SettingsSectionCard";
import { cn } from "@/lib/utils";

type DocumentStudioAiPanelProps = {
  t: (key: string) => string;
  canEdit: boolean;
  checking?: boolean;
  onCheck?: () => void;
};

export function DocumentStudioAiPanel({
  t,
  canEdit,
  checking = false,
  onCheck,
}: DocumentStudioAiPanelProps) {
  return (
    <div className="space-y-4 p-4 lg:p-5">
      <SettingsSectionCard>
        <CardContent className="space-y-4 pt-6">
          <div className="flex items-start gap-3">
            <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-[#E06737]/15 text-[#E06737]">
              <Sparkles className="size-5" aria-hidden />
            </span>
            <div>
              <h2 className="font-semibold text-foreground">
                {t("settings.documentStudio.ai.title")}
              </h2>
              <p className="mt-1 text-sm text-muted-foreground">
                {t("settings.documentStudio.ai.subtitle")}
              </p>
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            <AiMetric
              label={t("settings.documentStudio.ai.score")}
              value="—"
              hint={t("settings.documentStudio.ai.scoreHint")}
            />
            <AiMetric
              label={t("settings.documentStudio.ai.missing")}
              value="—"
              hint={t("settings.documentStudio.ai.missingHint")}
            />
            <AiMetric
              label={t("settings.documentStudio.ai.suggestions")}
              value="—"
              hint={t("settings.documentStudio.ai.suggestionsHint")}
            />
          </div>

          <ul className="space-y-2 rounded-lg border border-border bg-muted/30 px-3 py-3 text-sm text-muted-foreground">
            <li>{t("settings.documentStudio.ai.placeholder1")}</li>
            <li>{t("settings.documentStudio.ai.placeholder2")}</li>
            <li>{t("settings.documentStudio.ai.placeholder3")}</li>
          </ul>

          <Button
            type="button"
            variant="outline"
            className="w-full border-[#1D376A]/30 sm:w-auto"
            disabled={!canEdit || checking}
            onClick={onCheck}
          >
            {checking ? (
              <Loader2 className="mr-2 size-4 animate-spin" />
            ) : (
              <Sparkles className="mr-2 size-4" />
            )}
            {t("settings.documentStudio.ai.checkButton")}
          </Button>
          <p className="text-xs text-muted-foreground">{t("settings.documentStudio.ai.comingSoon")}</p>
        </CardContent>
      </SettingsSectionCard>
    </div>
  );
}

function AiMetric({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint: string;
}) {
  return (
    <div className="rounded-lg border border-border bg-card px-3 py-3">
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className={cn("mt-1 text-2xl font-semibold tabular-nums text-foreground")}>{value}</p>
      <p className="mt-1 text-xs text-muted-foreground">{hint}</p>
    </div>
  );
}
