"use client";

import { useState } from "react";
import { CheckCircle2, ChevronDown, Circle, Loader2, Plus } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { ProjectDoc, TaskDoc } from "@/lib/projects";
import { createTask, updateTaskStatus } from "@/lib/projects";
import { groupTasksByPhase, computeTaskProgressStats } from "@/lib/projectDashboard";
import { useI18n } from "@/i18n/I18nContext";
import { cn } from "@/lib/utils";

type ProjectTasksTabProps = {
  project: ProjectDoc;
  tasks: TaskDoc[];
  tasksError: string | null;
  onTasksChange: (tasks: TaskDoc[]) => void;
};

function PhaseSection({
  label,
  tasks,
  togglingTaskId,
  onToggle,
  t,
  defaultOpen,
}: {
  label: string;
  tasks: TaskDoc[];
  togglingTaskId: string | null;
  onToggle: (task: TaskDoc) => void;
  t: (key: string) => string;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen ?? true);
  const done = tasks.filter((x) => x.status === "DONE").length;

  return (
    <div className="rounded-lg border border-border/70 overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between gap-2 bg-muted/30 px-4 py-3 text-left"
      >
        <span className="font-medium text-[#1D376A] text-sm">{label}</span>
        <span className="flex items-center gap-2 text-xs text-muted-foreground">
          {done}/{tasks.length}
          <ChevronDown className={cn("size-4 transition-transform", open && "rotate-180")} />
        </span>
      </button>
      {open ? (
        <ul className="divide-y divide-border/60">
          {tasks.map((task) => (
            <li key={task.id} className="flex items-start gap-3 px-4 py-3">
              <Button
                variant="ghost"
                size="sm"
                className="h-8 w-8 p-0 shrink-0 mt-0.5"
                disabled={togglingTaskId === task.id}
                onClick={() => onToggle(task)}
              >
                {togglingTaskId === task.id ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : task.status === "DONE" ? (
                  <CheckCircle2 className="size-4 text-[#e06737]" />
                ) : (
                  <Circle className="size-4 text-muted-foreground" />
                )}
              </Button>
              <span
                className={cn(
                  "text-sm flex-1 pt-1",
                  task.status === "DONE" && "line-through text-muted-foreground"
                )}
              >
                {task.title || t("projects.noName")}
              </span>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

export function ProjectTasksTab({
  project,
  tasks,
  tasksError,
  onTasksChange,
}: ProjectTasksTabProps) {
  const { t } = useI18n();
  const [newTaskTitle, setNewTaskTitle] = useState("");
  const [addingTask, setAddingTask] = useState(false);
  const [togglingTaskId, setTogglingTaskId] = useState<string | null>(null);

  const groups = groupTasksByPhase(tasks);
  const stats = computeTaskProgressStats(tasks);

  const handleAddTask = async () => {
    if (!newTaskTitle.trim() || addingTask) return;
    setAddingTask(true);
    try {
      const taskId = await createTask(project.id, newTaskTitle.trim());
      onTasksChange([
        ...tasks,
        {
          id: taskId,
          projectId: project.id,
          title: newTaskTitle.trim(),
          status: "OPEN",
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
      ]);
      setNewTaskTitle("");
    } catch {
      /* ignore */
    } finally {
      setAddingTask(false);
    }
  };

  const handleToggleTask = async (task: TaskDoc) => {
    if (togglingTaskId) return;
    setTogglingTaskId(task.id);
    try {
      const nextStatus = task.status === "DONE" ? "OPEN" : "DONE";
      await updateTaskStatus(project.id, task.id, nextStatus);
      onTasksChange(
        tasks.map((x) => (x.id === task.id ? { ...x, status: nextStatus } : x))
      );
    } catch {
      /* ignore */
    } finally {
      setTogglingTaskId(null);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base text-[#1D376A]">{t("projects.dashboard.tab.tasks")}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {tasks.length > 0 ? (
          <div className="rounded-lg bg-muted/40 px-4 py-3 grid gap-2 sm:grid-cols-3 text-sm">
            <div>
              <p className="text-muted-foreground text-xs">{t("projects.dashboard.tasks.phases")}</p>
              <p className="font-semibold text-[#1D376A]">{stats.phaseCount}</p>
            </div>
            <div>
              <p className="text-muted-foreground text-xs">{t("projects.dashboard.tasks.taskCount")}</p>
              <p className="font-semibold text-[#1D376A]">{stats.total}</p>
            </div>
            <div>
              <p className="text-muted-foreground text-xs">{t("projects.dashboard.tasks.completed")}</p>
              <p className="font-semibold text-[#1D376A]">
                {t("projects.dashboard.kpi.progressPercent", { percent: String(stats.percent) })}
              </p>
            </div>
          </div>
        ) : null}

        <div className="flex gap-2">
          <Input
            placeholder={t("projects.newTaskPlaceholder")}
            value={newTaskTitle}
            onChange={(e) => setNewTaskTitle(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), void handleAddTask())}
          />
          <Button
            size="sm"
            className="bg-[#e06737] hover:bg-[#c9582f] shrink-0"
            onClick={() => void handleAddTask()}
            disabled={addingTask || !newTaskTitle.trim()}
          >
            <Plus className="size-4 mr-1" />
            {t("projects.addTask")}
          </Button>
        </div>

        {tasksError ? <p className="text-sm text-destructive">{tasksError}</p> : null}

        {tasks.length === 0 && !tasksError ? (
          <p className="py-8 text-center text-sm text-muted-foreground">
            {t("projects.tasksEmpty")}
          </p>
        ) : (
          <div className="space-y-3">
            {groups.map((group, i) => (
              <PhaseSection
                key={group.id}
                label={
                  group.label === "general"
                    ? t("projects.dashboard.phaseGeneral")
                    : group.label.startsWith("phase-")
                      ? t("projects.dashboard.phaseNumber", {
                          num: group.label.replace("phase-", ""),
                        })
                      : group.label
                }
                tasks={group.tasks}
                togglingTaskId={togglingTaskId}
                onToggle={(task) => void handleToggleTask(task)}
                t={t}
                defaultOpen={i === 0}
              />
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
