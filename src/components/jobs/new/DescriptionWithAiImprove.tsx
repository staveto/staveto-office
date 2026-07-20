"use client";

import { useState } from "react";
import { Loader2, Sparkles, Undo2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useI18n } from "@/i18n/I18nContext";
import type { Locale } from "@/i18n/translations";
import {
  extractImproveBriefError,
  improveProjectBrief,
  isImproveBriefEnabled,
  type ImproveBriefResult,
} from "@/services/ai/improveBriefService";
import { cn } from "@/lib/utils";
import { nj } from "./newJobFormStyles";

type Props = {
  id: string;
  value: string;
  onChange: (value: string) => void;
  label: string;
  placeholder?: string;
  rows?: number;
  projectName?: string;
  jobType?: string;
  location?: string;
  locale: Locale;
  attachmentNames?: string[];
  textareaClassName?: string;
  "data-testid"?: string;
};

/**
 * Short description / brief field with optional AI text improve + undo.
 * Independent of full AI project creation — only respects AI kill switches.
 */
export function DescriptionWithAiImprove({
  id,
  value,
  onChange,
  label,
  placeholder,
  rows = 3,
  projectName,
  jobType,
  location,
  locale,
  attachmentNames,
  textareaClassName,
  "data-testid": testId,
}: Props) {
  const { t } = useI18n();
  const [improving, setImproving] = useState(false);
  const [improveError, setImproveError] = useState<string | null>(null);
  const [improveResult, setImproveResult] = useState<ImproveBriefResult | null>(null);
  const [beforeImprove, setBeforeImprove] = useState<string | null>(null);

  const improveEnabled = isImproveBriefEnabled();
  const canImprove = improveEnabled && value.trim().length >= 10;

  const handleImprove = async () => {
    if (!canImprove || improving) return;
    setImproving(true);
    setImproveError(null);
    try {
      const previous = value;
      const res = await improveProjectBrief({
        brief: value,
        projectName,
        jobType,
        location,
        attachmentNames,
        locale,
      });
      if (res.improvedBrief && res.improvedBrief.trim() !== previous.trim()) {
        setBeforeImprove(previous);
        onChange(res.improvedBrief);
      }
      setImproveResult(res);
    } catch (err) {
      setImproveError(
        extractImproveBriefError(err) || t("projects.new.ai.improve.error")
      );
    } finally {
      setImproving(false);
    }
  };

  const handleUndo = () => {
    if (beforeImprove == null) return;
    onChange(beforeImprove);
    setBeforeImprove(null);
    setImproveResult(null);
  };

  return (
    <div className="space-y-2" data-testid={testId}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Label htmlFor={id} className={nj.label}>
          {label}
        </Label>
        {improveEnabled ? (
          <div className="flex items-center gap-2">
            {beforeImprove != null ? (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={handleUndo}
                disabled={improving}
                data-testid={`${id}-improve-undo`}
              >
                <Undo2 className="mr-1.5 size-3.5" />
                {t("projects.new.ai.improve.undo")}
              </Button>
            ) : null}
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => void handleImprove()}
              disabled={!canImprove || improving}
              title={canImprove ? undefined : t("projects.new.ai.improve.needMore")}
              data-testid={`${id}-improve-ai`}
            >
              {improving ? (
                <Loader2 className="mr-1.5 size-3.5 animate-spin" />
              ) : (
                <Sparkles className="mr-1.5 size-3.5 text-[#E95F2A]" />
              )}
              {improving
                ? t("projects.new.ai.improve.busy")
                : t("projects.new.ai.improve.cta")}
            </Button>
          </div>
        ) : null}
      </div>
      <Textarea
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        rows={rows}
        className={cn(nj.textarea, textareaClassName)}
      />
      {improveError ? (
        <p className="text-sm text-destructive" role="alert">
          {improveError}
        </p>
      ) : null}
      {improveResult &&
      (improveResult.addedDetails.length > 0 ||
        improveResult.openQuestions.length > 0) ? (
        <div className="mt-1 space-y-2 rounded-lg border border-[#E2E8F0] bg-[#F8FAFC] px-3 py-2 text-sm dark:border-[#334155] dark:bg-[#1E293B]">
          {improveResult.addedDetails.length > 0 ? (
            <div>
              <p className="text-xs font-semibold uppercase text-[#64748B]">
                {t("projects.new.ai.improve.clarified")}
              </p>
              <ul className="mt-1 list-disc pl-5 text-[#475569] dark:text-[#CBD5E1]">
                {improveResult.addedDetails.map((d, i) => (
                  <li key={i}>{d}</li>
                ))}
              </ul>
            </div>
          ) : null}
          {improveResult.openQuestions.length > 0 ? (
            <div>
              <p className="text-xs font-semibold uppercase text-[#B45309] dark:text-[#FCD34D]">
                {t("projects.new.ai.improve.openQuestions")}
              </p>
              <ul className="mt-1 list-disc pl-5 text-[#475569] dark:text-[#CBD5E1]">
                {improveResult.openQuestions.map((q, i) => (
                  <li key={i}>{q}</li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
