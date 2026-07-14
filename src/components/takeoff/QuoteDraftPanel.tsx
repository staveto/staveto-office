"use client";

/**
 * Quote draft panel — preview of quote lines generated from confirmed
 * occurrences (optionally expanded via assembly rules) and a one-click
 * "add to quote" that writes onto the existing editable quote draft.
 */

import { useMemo, useState } from "react";
import { FileText, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useI18n } from "@/i18n/I18nContext";
import type { DrawingOccurrence } from "@/types/drawingTakeoff";
import {
  buildQuoteLinesFromOccurrences,
  confirmedOccurrences,
} from "@/lib/takeoff/quoteGeneration";

type Props = {
  occurrences: DrawingOccurrence[];
  onAddToQuote: (expandAssemblies: boolean) => Promise<void>;
  busy: boolean;
  resultMessage: string | null;
};

export function QuoteDraftPanel({ occurrences, onAddToQuote, busy, resultMessage }: Props) {
  const { t } = useI18n();
  const [expandAssemblies, setExpandAssemblies] = useState(true);

  const confirmed = useMemo(() => confirmedOccurrences(occurrences), [occurrences]);
  const preview = useMemo(
    () =>
      buildQuoteLinesFromOccurrences(occurrences, {
        expandAssemblies,
        translate: t,
      }),
    [occurrences, expandAssemblies, t]
  );

  if (confirmed.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-border bg-muted/40 px-3 py-4 text-center text-xs text-muted-foreground">
        {t("takeoff.quote.emptyHint")}
      </div>
    );
  }

  return (
    <div className="space-y-3 rounded-lg border border-border bg-card p-3">
      <div className="flex items-center gap-2">
        <FileText className="size-4 text-primary" />
        <p className="text-sm font-semibold text-foreground">{t("takeoff.quote.title")}</p>
        <span className="ml-auto text-xs tabular-nums text-muted-foreground">
          {t("takeoff.quote.lineCount", { count: preview.length })}
        </span>
      </div>

      <div className="max-h-44 overflow-auto rounded border border-border">
        {preview.map((line) => (
          <div
            key={line.id}
            className="flex items-baseline gap-2 border-b border-border/60 px-2 py-1 text-xs"
          >
            <span className="min-w-0 flex-1 truncate text-foreground/90">
              {line.name}
              {line.source === "rule_derived" ? (
                <span className="ml-1 rounded bg-violet-500/15 px-1 text-[10px] font-semibold text-violet-700 dark:text-violet-300">
                  {t("takeoff.quote.ruleDerived")}
                </span>
              ) : null}
            </span>
            <span className="shrink-0 tabular-nums font-medium text-foreground">
              {line.quantity} {line.unit}
            </span>
            <span className="shrink-0 text-[10px] text-amber-600 dark:text-amber-400">
              {t("takeoff.quote.priceMissing")}
            </span>
          </div>
        ))}
      </div>

      <label className="flex items-center gap-2 text-xs text-muted-foreground">
        <input
          type="checkbox"
          checked={expandAssemblies}
          onChange={(e) => setExpandAssemblies(e.target.checked)}
          className="size-3.5 accent-primary"
        />
        {t("takeoff.quote.expandAssemblies")}
      </label>

      <Button
        type="button"
        size="sm"
        className="h-9 w-full bg-[#e06737] text-white hover:bg-[#C9552B]"
        disabled={busy}
        onClick={() => void onAddToQuote(expandAssemblies)}
      >
        <Plus className="size-4 mr-1" />
        {busy ? t("common.loading") : t("takeoff.quote.addToQuote")}
      </Button>

      {resultMessage ? (
        <p className="text-xs text-muted-foreground">{resultMessage}</p>
      ) : null}

      <p className="text-[11px] text-muted-foreground">{t("takeoff.quote.editableHint")}</p>
    </div>
  );
}
