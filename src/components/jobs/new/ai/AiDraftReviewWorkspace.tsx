"use client";

import { useCallback, useEffect, useState } from "react";
import { Loader2, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useI18n } from "@/i18n/I18nContext";
import type { AiProjectDraftLocal } from "@/lib/aiProjectDraftLocal";
import { njNavPrimary, njNavSecondary } from "../newJobFormStyles";
import { AiDraftAssistantPanel } from "./AiDraftAssistantPanel";
import { AiDraftEditNodeDialog, type AiDraftEditTarget } from "./AiDraftEditNodeDialog";
import { AiDraftPlanPanel, type AiReviewTab } from "./AiDraftPlanPanel";
import type { AiRefineNodeTarget } from "./aiDraftReviewTypes";

type Props = {
  draft: AiProjectDraftLocal;
  confirming?: boolean;
  regenerating?: boolean;
  refiningKey?: string | null;
  generateWarnings?: string[];
  onProjectTitleChange: (title: string) => void;
  onPhaseChange: (phaseId: string, patch: { name?: string; description?: string }) => void;
  onPhaseRemove: (phaseId: string) => void;
  onTaskChange: (
    phaseId: string,
    taskId: string,
    patch: { title?: string; description?: string }
  ) => void;
  onTaskRemove: (phaseId: string, taskId: string) => void;
  onMaterialToggle: (materialId: string, selected: boolean) => void;
  onRefine: (target: AiRefineNodeTarget, changeRequest: string) => Promise<void>;
  onRegenerate?: () => void;
  onContinueManual: () => void;
  onConfirm?: () => void;
  confirmError?: string | null;
};

export function AiDraftReviewWorkspace({
  draft,
  confirming,
  regenerating,
  refiningKey,
  generateWarnings = [],
  onProjectTitleChange,
  onPhaseChange,
  onPhaseRemove,
  onTaskChange,
  onTaskRemove,
  onMaterialToggle,
  onRefine,
  onRegenerate,
  onContinueManual,
  onConfirm,
  confirmError = null,
}: Props) {
  const { t } = useI18n();
  const [activeTab, setActiveTab] = useState<AiReviewTab>("tasks");
  const [selection, setSelection] = useState<AiRefineNodeTarget | null>(null);
  const [editTarget, setEditTarget] = useState<AiDraftEditTarget | null>(null);

  const selectPhase = useCallback(
    (phaseId: string, phaseIndex: number) => {
      const phase = draft.phases.find((p) => p.id === phaseId);
      if (!phase) return;
      setSelection({
        kind: "phase",
        phaseId,
        phaseIndex,
        title: phase.name,
        description: phase.description,
      });
    },
    [draft.phases]
  );

  const selectTask = useCallback(
    (phaseId: string, taskId: string, phaseIndex: number, taskIndex: number) => {
      const phase = draft.phases.find((p) => p.id === phaseId);
      const task = phase?.tasks.find((x) => x.id === taskId);
      if (!task) return;
      setSelection({
        kind: "task",
        phaseId,
        taskId,
        phaseIndex,
        taskIndex,
        title: task.title,
        description: task.description,
      });
    },
    [draft.phases]
  );

  const openEditPhase = (phaseId: string) => {
    const phase = draft.phases.find((p) => p.id === phaseId);
    if (!phase) return;
    setEditTarget({
      kind: "phase",
      phaseId,
      title: phase.name,
      description: phase.description,
    });
  };

  const openEditTask = (phaseId: string, taskId: string) => {
    const phase = draft.phases.find((p) => p.id === phaseId);
    const task = phase?.tasks.find((x) => x.id === taskId);
    if (!task) return;
    setEditTarget({
      kind: "task",
      phaseId,
      taskId,
      title: task.title,
      description: task.description,
    });
  };

  const handleEditSave = (target: AiDraftEditTarget, patch: { title: string; description: string }) => {
    if (target.kind === "phase") {
      onPhaseChange(target.phaseId, { name: patch.title, description: patch.description });
      setSelection((prev) =>
        prev?.kind === "phase" && prev.phaseId === target.phaseId
          ? { ...prev, title: patch.title, description: patch.description }
          : prev
      );
      return;
    }
    onTaskChange(target.phaseId, target.taskId, {
      title: patch.title,
      description: patch.description,
    });
    setSelection((prev) =>
      prev?.kind === "task" &&
      prev.phaseId === target.phaseId &&
      prev.taskId === target.taskId
        ? { ...prev, title: patch.title, description: patch.description }
        : prev
    );
  };

  const handleRefine = async (changeRequest: string) => {
    if (!selection) return;
    await onRefine(selection, changeRequest);
  };

  useEffect(() => {
    if (draft.phases.length === 0) return;
    setSelection((prev) => {
      if (prev) return prev;
      const phase = draft.phases[0];
      return {
        kind: "phase",
        phaseId: phase.id,
        phaseIndex: 0,
        title: phase.name,
        description: phase.description,
      };
    });
  }, [draft.phases]);

  useEffect(() => {
    setSelection((prev) => {
      if (!prev) return null;
      if (prev.kind === "phase") {
        const phase = draft.phases.find((p) => p.id === prev.phaseId);
        if (!phase) return null;
        return { ...prev, title: phase.name, description: phase.description };
      }
      const phase = draft.phases.find((p) => p.id === prev.phaseId);
      const task = phase?.tasks.find((x) => x.id === prev.taskId);
      if (!phase || !task) return null;
      return { ...prev, title: task.title, description: task.description };
    });
  }, [draft]);

  const handlePhaseRemove = (phaseId: string) => {
    onPhaseRemove(phaseId);
    setSelection((prev) => {
      if (!prev) return null;
      if (prev.kind === "phase" && prev.phaseId === phaseId) return null;
      if (prev.phaseId === phaseId) return null;
      return prev;
    });
  };

  const handleTaskRemove = (phaseId: string, taskId: string) => {
    onTaskRemove(phaseId, taskId);
    setSelection((prev) => {
      if (!prev) return null;
      if (prev.kind === "task" && prev.phaseId === phaseId && prev.taskId === taskId) return null;
      return prev;
    });
  };

  const handleEditManually = () => {
    if (!selection) return;
    if (selection.kind === "phase") {
      openEditPhase(selection.phaseId);
      return;
    }
    openEditTask(selection.phaseId, selection.taskId);
  };

  const busy = confirming || regenerating || !!refiningKey;

  return (
    <div className="space-y-4" data-testid="ai-review-workspace">
      <div
        className="rounded-xl border border-[#CBD5E1] bg-[#F6F8FB] px-4 py-3 text-sm text-[#475569]"
        role="status"
      >
        {t("projects.new.ai.safetyNotice")}
      </div>

      <div
        className="rounded-xl border border-[#CBD5E1] bg-[#F6F8FB] px-4 py-3 text-sm text-[#475569]"
        role="status"
      >
        {t("projects.new.ai.review.unsavedNotice")}
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(280px,360px)] lg:items-stretch lg:min-h-[480px]">
        <AiDraftPlanPanel
          draft={draft}
          activeTab={activeTab}
          onTabChange={setActiveTab}
          selection={selection}
          onSelectPhase={selectPhase}
          onSelectTask={selectTask}
          onProjectTitleChange={onProjectTitleChange}
          onPhaseRemove={handlePhaseRemove}
          onTaskRemove={handleTaskRemove}
          onMaterialToggle={onMaterialToggle}
          onEditPhase={openEditPhase}
          onEditTask={openEditTask}
          refiningKey={refiningKey}
          generateWarnings={generateWarnings}
        />

        <AiDraftAssistantPanel
          selection={selection}
          refining={!!refiningKey}
          disabled={busy}
          onRefine={handleRefine}
          onEditManually={handleEditManually}
        />
      </div>

      {confirmError ? (
        <div
          className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800"
          role="alert"
        >
          {confirmError}
        </div>
      ) : null}

      <div className="flex flex-wrap gap-3 pt-2 border-t border-[#E2E8F0]">
        <Button
          type="button"
          className={njNavPrimary()}
          disabled={busy}
          onClick={onConfirm}
        >
          {confirming ? (
            <>
              <Loader2 className="size-4 mr-2 animate-spin" aria-hidden />
              {t("projects.new.ai.review.confirming")}
            </>
          ) : (
            t("projects.new.ai.review.confirm")
          )}
        </Button>
        {onRegenerate ? (
          <Button
            type="button"
            variant="outline"
            className={njNavSecondary()}
            disabled={busy}
            onClick={onRegenerate}
          >
            {regenerating ? (
              <>
                <Loader2 className="size-4 mr-2 animate-spin" aria-hidden />
                {t("common.loading")}
              </>
            ) : (
              <>
                <RefreshCw className="size-4 mr-2" aria-hidden />
                {t("projects.new.ai.regenerate")}
              </>
            )}
          </Button>
        ) : null}
        <Button
          type="button"
          variant="outline"
          className={njNavSecondary()}
          disabled={busy}
          onClick={onContinueManual}
        >
          {t("projects.new.ai.continueManual")}
        </Button>
      </div>

      <AiDraftEditNodeDialog
        target={editTarget}
        onClose={() => setEditTarget(null)}
        onSave={handleEditSave}
      />
    </div>
  );
}
