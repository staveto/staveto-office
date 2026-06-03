"use client";

import { Trash2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useI18n } from "@/i18n/I18nContext";
import type { DraftTask } from "@/lib/aiProjectDraftLocal";
import { nj } from "../newJobFormStyles";

type Props = {
  tasks: DraftTask[];
  phaseId: string;
  onTaskChange: (phaseId: string, taskId: string, patch: { title?: string; description?: string }) => void;
  onTaskRemove: (phaseId: string, taskId: string) => void;
};

export function AiDraftTaskList({ tasks, phaseId, onTaskChange, onTaskRemove }: Props) {
  const { t } = useI18n();

  if (tasks.length === 0) {
    return (
      <p className="text-sm text-[#64748B] py-2">{t("projects.new.ai.review.noTasks")}</p>
    );
  }

  return (
    <ul className="space-y-3" role="list">
      {tasks.map((task, index) => (
        <li
          key={task.id}
          className="rounded-lg border border-[#E2E8F0] bg-[#FAFBFC] p-3 space-y-2"
        >
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs font-semibold text-[#64748B] uppercase tracking-wide">
              {t("projects.new.ai.review.taskLabel", { index: index + 1 })}
            </span>
            <button
              type="button"
              className="text-[#64748B] hover:text-destructive p-1"
              onClick={() => onTaskRemove(phaseId, task.id)}
              aria-label={t("projects.new.ai.review.removeTask")}
            >
              <Trash2 className="size-4" aria-hidden />
            </button>
          </div>
          <Input
            value={task.title}
            onChange={(e) => onTaskChange(phaseId, task.id, { title: e.target.value })}
            className={nj.input}
            aria-label={t("projects.new.ai.review.taskTitle")}
          />
          <Textarea
            value={task.description ?? ""}
            onChange={(e) => onTaskChange(phaseId, task.id, { description: e.target.value })}
            rows={2}
            className={nj.textarea}
            placeholder={t("projects.new.ai.review.taskDescPlaceholder")}
          />
        </li>
      ))}
    </ul>
  );
}
