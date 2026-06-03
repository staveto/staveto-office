"use client";

import { Trash2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useI18n } from "@/i18n/I18nContext";
import type { DraftPhase } from "@/lib/aiProjectDraftLocal";
import { nj } from "../newJobFormStyles";
import { AiDraftTaskList } from "./AiDraftTaskList";

type Props = {
  phase: DraftPhase;
  phaseIndex: number;
  onPhaseChange: (phaseId: string, patch: { name?: string; description?: string }) => void;
  onPhaseRemove: (phaseId: string) => void;
  onTaskChange: (phaseId: string, taskId: string, patch: { title?: string; description?: string }) => void;
  onTaskRemove: (phaseId: string, taskId: string) => void;
};

export function AiDraftPhaseCard({
  phase,
  phaseIndex,
  onPhaseChange,
  onPhaseRemove,
  onTaskChange,
  onTaskRemove,
}: Props) {
  const { t } = useI18n();

  return (
    <article className="rounded-xl border border-[#CBD5E1] bg-white p-4 space-y-4 shadow-sm">
      <div className="flex items-start justify-between gap-2">
        <span className="text-xs font-bold text-[#E95F2A] uppercase tracking-wide">
          {t("projects.new.ai.review.phaseLabel", { index: phaseIndex + 1 })}
        </span>
        <button
          type="button"
          className="text-[#64748B] hover:text-destructive p-1 shrink-0"
          onClick={() => onPhaseRemove(phase.id)}
          aria-label={t("projects.new.ai.review.removePhase")}
        >
          <Trash2 className="size-4" aria-hidden />
        </button>
      </div>
      <Input
        value={phase.name}
        onChange={(e) => onPhaseChange(phase.id, { name: e.target.value })}
        className={nj.input}
        aria-label={t("projects.new.ai.review.phaseName")}
      />
      <Textarea
        value={phase.description ?? ""}
        onChange={(e) => onPhaseChange(phase.id, { description: e.target.value })}
        rows={2}
        className={nj.textarea}
        placeholder={t("projects.new.ai.review.phaseDescPlaceholder")}
      />
      <AiDraftTaskList
        tasks={phase.tasks}
        phaseId={phase.id}
        onTaskChange={onTaskChange}
        onTaskRemove={onTaskRemove}
      />
    </article>
  );
}
