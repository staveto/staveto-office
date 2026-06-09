"use client";

import { useMemo, useState } from "react";
import {
  ChevronDown,
  ChevronUp,
  Circle,
  Pencil,
  Sparkles,
  Trash2,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { useI18n } from "@/i18n/I18nContext";
import type { AiProjectDraftLocal } from "@/lib/aiProjectDraftLocal";
import { cn } from "@/lib/utils";
import { nj } from "../newJobFormStyles";
import type { AiRefineNodeTarget } from "./aiDraftReviewTypes";

export type AiReviewTab = "overview" | "tasks" | "materials";

type Props = {
  draft: AiProjectDraftLocal;
  activeTab: AiReviewTab;
  onTabChange: (tab: AiReviewTab) => void;
  selection: AiRefineNodeTarget | null;
  onSelectPhase: (phaseId: string, phaseIndex: number) => void;
  onSelectTask: (
    phaseId: string,
    taskId: string,
    phaseIndex: number,
    taskIndex: number
  ) => void;
  onProjectTitleChange: (title: string) => void;
  onPhaseRemove: (phaseId: string) => void;
  onTaskRemove: (phaseId: string, taskId: string) => void;
  onMaterialToggle: (materialId: string, selected: boolean) => void;
  onEditPhase: (phaseId: string) => void;
  onEditTask: (phaseId: string, taskId: string) => void;
  refiningKey?: string | null;
  generateWarnings?: string[];
};

const TAB_KEYS: AiReviewTab[] = ["overview", "tasks", "materials"];

export function AiDraftPlanPanel({
  draft,
  activeTab,
  onTabChange,
  selection,
  onSelectPhase,
  onSelectTask,
  onProjectTitleChange,
  onPhaseRemove,
  onTaskRemove,
  onMaterialToggle,
  onEditPhase,
  onEditTask,
  refiningKey,
  generateWarnings = [],
}: Props) {
  const { t } = useI18n();
  const phaseCount = draft.phases.length;
  const taskCount = useMemo(
    () => draft.phases.reduce((sum, p) => sum + p.tasks.length, 0),
    [draft.phases]
  );
  const collapsePhasesByDefault = phaseCount > 1;

  const defaultExpanded = useMemo(() => {
    const m: Record<string, boolean> = {};
    draft.phases.forEach((p) => {
      m[p.id] = !collapsePhasesByDefault;
    });
    return m;
  }, [collapsePhasesByDefault, draft.phases]);

  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  const isOpen = (id: string) => (expanded[id] !== undefined ? expanded[id] : defaultExpanded[id]);

  const togglePhase = (id: string) => {
    setExpanded((prev) => ({ ...prev, [id]: !isOpen(id) }));
  };

  const isPhaseSelected = (phaseId: string) =>
    selection?.kind === "phase" && selection.phaseId === phaseId;

  const isTaskSelected = (phaseId: string, taskId: string) =>
    selection?.kind === "task" &&
    selection.phaseId === phaseId &&
    selection.taskId === taskId;

  const materialCount = draft.materialSuggestions?.length ?? 0;

  return (
    <div
      className="flex flex-col min-h-0 rounded-xl border-2 border-[#CBD5E1] bg-white overflow-hidden"
      data-testid="ai-plan-panel"
    >
      <div className="px-4 py-3 border-b border-[#E2E8F0] bg-[#F6F8FB]">
        <p className="text-sm font-bold text-[#0F2A4D]">
          {t("projects.new.ai.workspace.structureSummary", {
            phaseCount: String(phaseCount),
            taskCount: String(taskCount),
          })}
        </p>
        <p className="mt-0.5 text-xs text-[#64748B]">
          {t("projects.new.ai.workspace.tapPhaseTaskHint")}
        </p>
      </div>

      <div
        className="flex border-b border-[#E2E8F0] bg-white"
        role="tablist"
        aria-label={t("projects.new.ai.workspace.planTabs")}
      >
        {TAB_KEYS.map((tab) => (
          <button
            key={tab}
            type="button"
            role="tab"
            aria-selected={activeTab === tab}
            data-testid={`ai-tab-${tab}`}
            onClick={() => onTabChange(tab)}
            className={cn(
              "flex-1 px-3 py-2.5 text-xs sm:text-sm font-bold transition-colors",
              activeTab === tab
                ? "text-[#E95F2A] border-b-2 border-[#E95F2A] bg-[#FFF8F5]"
                : "text-[#64748B] hover:text-[#0F2A4D] hover:bg-[#F8FAFC]"
            )}
          >
            {t(`projects.new.ai.workspace.tab.${tab}`)}
            {tab === "materials" && materialCount > 0 ? (
              <span className="ml-1.5 inline-flex min-w-[1.25rem] items-center justify-center rounded-full bg-[#E95F2A]/15 px-1.5 py-0.5 text-[10px] font-bold text-[#E95F2A]">
                {materialCount}
              </span>
            ) : null}
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-4 min-h-[280px]">
        {activeTab === "overview" ? (
          <>
            <div className="space-y-2">
              <label htmlFor="ai-workspace-project-title" className={nj.label}>
                {t("projects.new.ai.projectName")}
              </label>
              <Input
                id="ai-workspace-project-title"
                value={draft.projectTitle}
                onChange={(e) => onProjectTitleChange(e.target.value)}
                className={nj.input}
              />
            </div>
            {draft.summary?.trim() ? (
              <div className="rounded-lg border border-[#E2E8F0] bg-[#F6F8FB] px-3 py-2.5">
                <p className="text-sm text-[#334155] leading-relaxed">{draft.summary.trim()}</p>
              </div>
            ) : null}
            {generateWarnings.length > 0 ? (
              <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-950">
                <p className="font-medium">{t("projects.new.ai.documentsPartial")}</p>
                <ul className="mt-1 list-disc pl-4 space-y-0.5">
                  {generateWarnings.map((w) => (
                    <li key={w}>{w}</li>
                  ))}
                </ul>
              </div>
            ) : null}
          </>
        ) : null}

        {activeTab === "tasks" ? (
          <div className="space-y-3">
            {draft.phases.length === 0 ? (
              <p className="text-sm text-[#64748B]">{t("projects.new.ai.review.noTasks")}</p>
            ) : (
              draft.phases.map((phase, pi) => {
                const open = isOpen(phase.id);
                const refiningPhase = refiningKey === phase.id;
                const phaseTitle =
                  phase.name?.trim() || t("projects.new.ai.workspace.unnamedPhase");
                const selected = isPhaseSelected(phase.id);

                return (
                  <article
                    key={phase.id}
                    className={cn(
                      "rounded-xl border overflow-hidden transition-shadow",
                      selected
                        ? "border-[#E95F2A] ring-2 ring-[#E95F2A]/25 shadow-sm"
                        : "border-[#E2E8F0]"
                    )}
                  >
                    <div className="flex items-stretch bg-white">
                      <button
                        type="button"
                        onClick={() => {
                          onSelectPhase(phase.id, pi);
                          if (!open) togglePhase(phase.id);
                        }}
                        className={cn(
                          "flex-1 min-w-0 text-left px-3 py-3 transition-colors",
                          selected ? "bg-[#FFF8F5]" : "hover:bg-[#F8FAFC]"
                        )}
                      >
                        <p className="text-[11px] font-bold uppercase tracking-wide text-[#E95F2A] mb-0.5">
                          {t("projects.new.ai.review.phaseLabel", { index: pi + 1 })}
                        </p>
                        <p className="font-bold text-[#0F2A4D] text-[15px] leading-snug">
                          {phaseTitle}
                        </p>
                        {!open ? (
                          <p className="mt-1 text-xs text-[#64748B]">
                            {t("projects.new.ai.workspace.phaseTaskCount", {
                              count: String(phase.tasks.length),
                            })}
                          </p>
                        ) : phase.description?.trim() ? (
                          <p className="mt-1 text-xs text-[#64748B] line-clamp-3">
                            {phase.description.trim()}
                          </p>
                        ) : null}
                      </button>
                      <div className="flex items-start gap-0.5 pt-2 pr-1 shrink-0">
                        <button
                          type="button"
                          className="p-1.5 text-[#E95F2A] hover:bg-[#FFF8F5] rounded-md disabled:opacity-50"
                          disabled={!!refiningKey}
                          onClick={() => onSelectPhase(phase.id, pi)}
                          aria-label={t("projects.new.ai.refine.withAi")}
                        >
                          {refiningPhase ? (
                            <span className="text-xs font-bold px-1">…</span>
                          ) : (
                            <Sparkles className="size-4" aria-hidden />
                          )}
                        </button>
                        <button
                          type="button"
                          className="p-1.5 text-[#64748B] hover:text-[#0F2A4D] rounded-md"
                          onClick={() => onEditPhase(phase.id)}
                          aria-label={t("projects.new.ai.workspace.editManually")}
                        >
                          <Pencil className="size-4" aria-hidden />
                        </button>
                        <button
                          type="button"
                          className="p-1.5 text-[#64748B] hover:text-destructive rounded-md"
                          onClick={() => onPhaseRemove(phase.id)}
                          aria-label={t("projects.new.ai.review.removePhase")}
                        >
                          <Trash2 className="size-4" aria-hidden />
                        </button>
                        <button
                          type="button"
                          className="p-1.5 text-[#64748B] hover:text-[#0F2A4D] rounded-md"
                          onClick={() => togglePhase(phase.id)}
                          aria-expanded={open}
                          aria-label={
                            open
                              ? t("projects.new.ai.workspace.collapsePhase")
                              : t("projects.new.ai.workspace.expandPhase")
                          }
                        >
                          {open ? (
                            <ChevronUp className="size-4" aria-hidden />
                          ) : (
                            <ChevronDown className="size-4" aria-hidden />
                          )}
                        </button>
                      </div>
                    </div>

                    {open ? (
                      <ul className="border-t border-[#E2E8F0] bg-[#FAFBFC]" role="list">
                        {phase.tasks.length === 0 ? (
                          <li className="px-3 py-3 text-sm text-[#64748B]">
                            {t("projects.new.ai.review.noTasks")}
                          </li>
                        ) : (
                          phase.tasks.map((task, ti) => {
                            const refineKey = `${phase.id}:${task.id}`;
                            const refiningTask = refiningKey === refineKey;
                            const taskTitle =
                              task.title?.trim() || t("projects.new.ai.workspace.unnamedTask");
                            const taskSelected = isTaskSelected(phase.id, task.id);

                            return (
                              <li
                                key={task.id}
                                className={cn(
                                  "flex items-stretch border-t border-[#E2E8F0] first:border-t-0",
                                  taskSelected && "bg-[#FFF8F5]"
                                )}
                              >
                                <button
                                  type="button"
                                  onClick={() => onSelectTask(phase.id, task.id, pi, ti)}
                                  className={cn(
                                    "flex-1 min-w-0 flex items-start gap-2.5 text-left px-3 py-2.5 transition-colors",
                                    taskSelected
                                      ? "ring-1 ring-inset ring-[#E95F2A]/30"
                                      : "hover:bg-white"
                                  )}
                                >
                                  <Circle
                                    className={cn(
                                      "size-4 mt-0.5 shrink-0",
                                      taskSelected ? "text-[#E95F2A]" : "text-[#CBD5E1]"
                                    )}
                                    aria-hidden
                                  />
                                  <span className="min-w-0">
                                    <span className="block font-semibold text-[#0F2A4D] text-sm leading-snug">
                                      {taskTitle}
                                    </span>
                                    {task.description?.trim() ? (
                                      <span className="block mt-0.5 text-xs text-[#64748B] line-clamp-2">
                                        {task.description.trim()}
                                      </span>
                                    ) : null}
                                  </span>
                                </button>
                                <div className="flex items-center gap-0.5 pr-1 shrink-0">
                                  <button
                                    type="button"
                                    className="p-1.5 text-[#E95F2A] hover:bg-[#FFF8F5] rounded-md disabled:opacity-50"
                                    disabled={!!refiningKey}
                                    onClick={() => onSelectTask(phase.id, task.id, pi, ti)}
                                    aria-label={t("projects.new.ai.refine.withAi")}
                                  >
                                    {refiningTask ? (
                                      <span className="text-xs font-bold px-1">…</span>
                                    ) : (
                                      <Sparkles className="size-3.5" aria-hidden />
                                    )}
                                  </button>
                                  <button
                                    type="button"
                                    className="p-1.5 text-[#64748B] hover:text-[#0F2A4D] rounded-md"
                                    onClick={() => onEditTask(phase.id, task.id)}
                                    aria-label={t("projects.new.ai.workspace.editManually")}
                                  >
                                    <Pencil className="size-3.5" aria-hidden />
                                  </button>
                                  <button
                                    type="button"
                                    className="p-1.5 text-[#64748B] hover:text-destructive rounded-md"
                                    onClick={() => onTaskRemove(phase.id, task.id)}
                                    aria-label={t("projects.new.ai.review.removeTask")}
                                  >
                                    <Trash2 className="size-3.5" aria-hidden />
                                  </button>
                                </div>
                              </li>
                            );
                          })
                        )}
                      </ul>
                    ) : null}
                  </article>
                );
              })
            )}
          </div>
        ) : null}

        {activeTab === "materials" ? (
          <>
            {draft.materialSuggestions && draft.materialSuggestions.length > 0 ? (
              <>
                <p className="text-xs text-[#64748B] leading-relaxed">
                  {t("projects.new.ai.workspace.materialsHint")}
                </p>
                <ul className="space-y-2" role="list">
                  {draft.materialSuggestions.map((m) => (
                    <li key={m.id}>
                      <label className="flex items-start gap-3 rounded-lg border border-[#E2E8F0] px-3 py-2.5 cursor-pointer hover:bg-[#F8FAFC] transition-colors">
                        <input
                          type="checkbox"
                          checked={m.selected}
                          onChange={(e) => onMaterialToggle(m.id, e.target.checked)}
                          className="mt-1 size-4 accent-[#E95F2A]"
                        />
                        <span className="text-sm text-[#334155] min-w-0">
                          <span className="font-semibold block">{m.name}</span>
                          {m.description ? (
                            <span className="block text-[#64748B] text-xs mt-0.5">
                              {m.description}
                            </span>
                          ) : null}
                        </span>
                      </label>
                    </li>
                  ))}
                </ul>
              </>
            ) : (
              <p className="text-sm text-[#64748B]">{t("projects.new.ai.workspace.noMaterials")}</p>
            )}
          </>
        ) : null}
      </div>
    </div>
  );
}
