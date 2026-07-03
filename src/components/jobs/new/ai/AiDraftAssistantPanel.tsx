"use client";

import { useEffect, useState } from "react";
import { Loader2, Pencil, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useI18n } from "@/i18n/I18nContext";
import { cn } from "@/lib/utils";
import { nj } from "../newJobFormStyles";
import type { AiRefineNodeTarget } from "./aiDraftReviewTypes";

const QUICK_SUGGESTION_KEYS = [
  "projects.new.ai.workspace.suggestionSafety",
  "projects.new.ai.workspace.suggestionSplit",
  "projects.new.ai.workspace.suggestionDetail",
  "projects.new.ai.workspace.suggestionRename",
] as const;

type Props = {
  selection: AiRefineNodeTarget | null;
  refining?: boolean;
  disabled?: boolean;
  onRefine: (changeRequest: string) => Promise<void>;
  onEditManually: () => void;
};

export function AiDraftAssistantPanel({
  selection,
  refining,
  disabled,
  onRefine,
  onEditManually,
}: Props) {
  const { t } = useI18n();
  const [changeRequest, setChangeRequest] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setChangeRequest("");
    setError(null);
  }, [selection]);

  const handleSubmit = async () => {
    const trimmed = changeRequest.trim();
    if (!trimmed || !selection) {
      setError(t("projects.new.ai.refine.requestRequired"));
      return;
    }
    setError(null);
    try {
      await onRefine(trimmed);
      setChangeRequest("");
    } catch (err) {
      setError(err instanceof Error ? err.message : t("projects.new.ai.refine.error"));
    }
  };

  const handleQuickSuggestion = (key: (typeof QUICK_SUGGESTION_KEYS)[number]) => {
    const suggestion = t(key);
    setChangeRequest(suggestion);
    if (selection && !refining && !disabled) {
      void (async () => {
        setError(null);
        try {
          await onRefine(suggestion);
          setChangeRequest("");
        } catch (err) {
          setError(err instanceof Error ? err.message : t("projects.new.ai.refine.error"));
        }
      })();
    }
  };

  const contextLabel =
    selection?.kind === "task"
      ? t("projects.new.ai.workspace.contextTask")
      : selection?.kind === "phase"
        ? t("projects.new.ai.workspace.contextPhase")
        : null;

  return (
    <aside className={cn(nj.workspaceShell)} data-testid="ai-assistant-panel">
      <div className={nj.workspaceHeader}>
        <div className="flex items-center gap-2">
          <Sparkles className="size-4 text-[#E95F2A] shrink-0" aria-hidden />
          <h3 className="text-sm font-bold text-[#0F2A4D] dark:text-[#F8FAFC]">
            {t("projects.new.ai.workspace.assistantTitle")}
          </h3>
        </div>
        <p className="mt-1 text-xs text-[#64748B] dark:text-[#94A3B8] leading-relaxed">
          {t("projects.new.ai.workspace.assistantHint")}
        </p>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {!selection ? (
          <div className={nj.workspaceEmpty}>
            <p className="text-sm text-[#64748B] dark:text-[#94A3B8] leading-relaxed">
              {t("projects.new.ai.workspace.selectHint")}
            </p>
          </div>
        ) : (
          <>
            <div className={cn(nj.workspaceSurface, "px-3 py-3")}>
              {contextLabel ? (
                <p className="text-[11px] font-bold uppercase tracking-wide text-[#64748B] dark:text-[#94A3B8] mb-1.5">
                  {contextLabel}
                </p>
              ) : null}
              <p className="font-semibold text-[#0F2A4D] dark:text-[#F8FAFC] text-[15px] leading-snug">
                {selection.title?.trim() || t("projects.new.ai.workspace.unnamed")}
              </p>
              {selection.description?.trim() ? (
                <p className="mt-1.5 text-sm text-[#64748B] dark:text-[#94A3B8] leading-relaxed line-clamp-6">
                  {selection.description.trim()}
                </p>
              ) : null}
            </div>

            <div className="space-y-2">
              <Label htmlFor="ai-assistant-request" className={nj.label}>
                {t("projects.new.ai.refine.requestLabel")}
              </Label>
              <Textarea
                id="ai-assistant-request"
                value={changeRequest}
                onChange={(e) => setChangeRequest(e.target.value)}
                rows={5}
                placeholder={t("projects.new.ai.refine.requestPlaceholder")}
                className={nj.textarea}
                disabled={refining || disabled}
              />
            </div>

            <div className="space-y-2">
              <p className="text-xs font-semibold text-[#64748B] dark:text-[#94A3B8]">
                {t("projects.new.ai.workspace.quickSuggestions")}
              </p>
              <p className="text-xs text-[#64748B] leading-relaxed">
                {t("projects.new.ai.workspace.quickSuggestionsHint")}
              </p>
              <div className="flex flex-wrap gap-2">
                {QUICK_SUGGESTION_KEYS.map((key) => (
                  <button
                    key={key}
                    type="button"
                    disabled={refining || disabled}
                    onClick={() => handleQuickSuggestion(key)}
                    className={cn(
                      "rounded-full border border-[#CBD5E1] bg-white px-3 py-1.5 text-xs font-semibold text-[#334155]",
                      "hover:border-[#E95F2A]/50 hover:bg-[#FFF8F5] transition-colors",
                      "dark:border-[#475569] dark:bg-[#243247] dark:text-[#CBD5E1] dark:hover:bg-[#2C3D55]",
                      "disabled:opacity-50 disabled:cursor-not-allowed"
                    )}
                  >
                    {t(key)}
                  </button>
                ))}
              </div>
            </div>

            {error ? (
              <p className="text-sm text-destructive" role="alert">
                {error}
              </p>
            ) : null}

            <p className="text-xs text-[#64748B]">{t("projects.new.ai.safetyNotice")}</p>
          </>
        )}
      </div>

      <div className={nj.workspaceFooter}>
        <Button
          type="button"
          className="w-full"
          disabled={!selection || !changeRequest.trim() || refining || disabled}
          onClick={() => void handleSubmit()}
        >
          {refining ? (
            <>
              <Loader2 className="size-4 mr-2 animate-spin" aria-hidden />
              {t("common.loading")}
            </>
          ) : (
            <>
              <Sparkles className="size-4 mr-2" aria-hidden />
              {t("projects.new.ai.refine.submit")}
            </>
          )}
        </Button>
        {selection && !changeRequest.trim() && !refining ? (
          <p className="text-[11px] text-center text-[#64748B] leading-snug">
            {t("projects.new.ai.workspace.quickSuggestionsHint")}
          </p>
        ) : null}
        <Button
          type="button"
          variant="outline"
          className="w-full"
          disabled={!selection || refining || disabled}
          onClick={onEditManually}
        >
          <Pencil className="size-4 mr-2" aria-hidden />
          {t("projects.new.ai.workspace.editManually")}
        </Button>
      </div>
    </aside>
  );
}
