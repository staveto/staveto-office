"use client";

import { AlertTriangle, Sparkles, Loader2, TrendingUp } from "lucide-react";
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
        <CardContent className="space-y-5 pt-6">
          <div className="flex items-start gap-3">
            <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-[#E06737]/20 to-[#1D376A]/10 text-[#E06737]">
              <Sparkles className="size-5" aria-hidden />
            </span>
            <div>
              <h2 className="font-semibold text-foreground">
                {t("settings.documentStudio.ai.title")}
              </h2>
              <p className="mt-1 text-sm text-muted-foreground">
                {t("settings.documentStudio.ai.subtitle")}
              </p>
              <p className="mt-2 text-xs leading-relaxed text-[#1D376A]">
                {t("settings.documentStudio.ai.assistantNote")}
              </p>
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <AiScoreCard
              label={t("settings.documentStudio.ai.score")}
              score={82}
              hint={t("settings.documentStudio.ai.scoreHint")}
              accent="primary"
            />
            <AiScoreCard
              label={t("settings.documentStudio.ai.salesClarity")}
              score={76}
              hint={t("settings.documentStudio.ai.salesClarityHint")}
              accent="accent"
            />
          </div>

          <div className="grid gap-3 lg:grid-cols-3">
            <AiListCard
              title={t("settings.documentStudio.ai.missing")}
              hint={t("settings.documentStudio.ai.missingHint")}
              items={[
                t("settings.documentStudio.ai.missingItem1"),
                t("settings.documentStudio.ai.missingItem2"),
                t("settings.documentStudio.ai.missingItem3"),
              ]}
              icon={AlertTriangle}
              tone="amber"
            />
            <AiListCard
              title={t("settings.documentStudio.ai.risks")}
              hint={t("settings.documentStudio.ai.risksHint")}
              items={[
                t("settings.documentStudio.ai.riskItem1"),
                t("settings.documentStudio.ai.riskItem2"),
              ]}
              icon={AlertTriangle}
              tone="rose"
            />
            <AiListCard
              title={t("settings.documentStudio.ai.suggestions")}
              hint={t("settings.documentStudio.ai.suggestionsHint")}
              items={[
                t("settings.documentStudio.ai.suggestionItem1"),
                t("settings.documentStudio.ai.suggestionItem2"),
                t("settings.documentStudio.ai.suggestionItem3"),
              ]}
              icon={TrendingUp}
              tone="emerald"
            />
          </div>

          <Button
            type="button"
            className="w-full bg-[#1D376A] text-white hover:bg-[#162d58] sm:w-auto"
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

function AiScoreCard({
  label,
  score,
  hint,
  accent,
}: {
  label: string;
  score: number;
  hint: string;
  accent: "primary" | "accent";
}) {
  return (
    <div className="rounded-xl border border-border bg-gradient-to-br from-white to-slate-50 px-4 py-4 shadow-sm">
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
      <p
        className={cn(
          "mt-1 text-3xl font-bold tabular-nums",
          accent === "primary" ? "text-[#1D376A]" : "text-[#E06737]"
        )}
      >
        {score}
        <span className="text-base font-medium text-muted-foreground">/100</span>
      </p>
      <p className="mt-1 text-xs text-muted-foreground">{hint}</p>
    </div>
  );
}

function AiListCard({
  title,
  hint,
  items,
  icon: Icon,
  tone,
}: {
  title: string;
  hint: string;
  items: string[];
  icon: typeof Sparkles;
  tone: "amber" | "rose" | "emerald";
}) {
  const toneClass =
    tone === "amber"
      ? "border-amber-200 bg-amber-50/50"
      : tone === "rose"
        ? "border-rose-200 bg-rose-50/50"
        : "border-emerald-200 bg-emerald-50/50";

  return (
    <div className={cn("rounded-xl border px-3 py-3", toneClass)}>
      <div className="flex items-center gap-2">
        <Icon className="size-4 shrink-0 text-muted-foreground" aria-hidden />
        <div>
          <p className="text-sm font-semibold text-foreground">{title}</p>
          <p className="text-[11px] text-muted-foreground">{hint}</p>
        </div>
      </div>
      <ul className="mt-2 space-y-1.5 text-xs leading-relaxed text-muted-foreground">
        {items.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>
    </div>
  );
}
