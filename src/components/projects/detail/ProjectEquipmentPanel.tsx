"use client";

import { useState } from "react";
import Link from "next/link";
import { Loader2, Plus, Truck, Wrench, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { ProjectToolRecord } from "@/services/projects/projectToolsService";
import type { TaskToolSnapshot } from "@/services/projects/taskPlanningTypes";
import { TaskToolsPicker } from "./TaskToolsPicker";
import { cn } from "@/lib/utils";

type Props = {
  projectAssigned: ProjectToolRecord[];
  availableTools: ProjectToolRecord[];
  canManage: boolean;
  busy?: boolean;
  onAssignToProject: (tools: TaskToolSnapshot[]) => Promise<void>;
  onUnassignFromProject: (toolId: string) => Promise<void>;
  t: (key: string) => string;
};

export function ProjectEquipmentPanel({
  projectAssigned,
  availableTools,
  canManage,
  busy,
  onAssignToProject,
  onUnassignFromProject,
  t,
}: Props) {
  const [pickerOpen, setPickerOpen] = useState(false);
  const [removingId, setRemovingId] = useState<string | null>(null);

  const notYetOnProject = availableTools.filter((tool) => !tool.assignedToProject);

  const handleSave = async (picked: TaskToolSnapshot[]) => {
    await onAssignToProject(picked);
    setPickerOpen(false);
  };

  const handleRemove = async (toolId: string) => {
    setRemovingId(toolId);
    try {
      await onUnassignFromProject(toolId);
    } finally {
      setRemovingId(null);
    }
  };

  return (
    <section className="space-y-3 rounded-xl border border-[var(--po-card-border)] bg-[var(--po-card-bg)] p-4 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h3 className="text-sm font-bold text-[var(--po-text-primary)]">{t("projects.equipment.projectTitle")}</h3>
          <p className="text-xs text-[var(--po-text-muted)] mt-0.5">
            {t("projects.equipment.projectHint")}
          </p>
        </div>
        {canManage ? (
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="h-8 shrink-0"
            disabled={busy}
            onClick={() => setPickerOpen(true)}
          >
            <Plus className="size-3.5 mr-1" />
            {t("projects.equipment.addToProject")}
          </Button>
        ) : null}
      </div>

      {projectAssigned.length === 0 ? (
        <p className="text-sm text-muted-foreground py-2">{t("projects.equipment.projectEmpty")}</p>
      ) : (
        <ul className="flex flex-wrap gap-2">
          {projectAssigned.map((tool) => (
            <li
              key={tool.id}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-full border border-[var(--po-card-border)]",
                "bg-[var(--po-card-muted)] px-3 py-1.5 text-sm text-[var(--po-text-primary)]"
              )}
            >
              <Truck className="size-3.5 shrink-0 opacity-70" />
              <span className="font-medium">{tool.name}</span>
              {tool.type ? (
                <span className="text-xs opacity-70">· {tool.type}</span>
              ) : null}
              {canManage ? (
                <button
                  type="button"
                  className="ml-1 p-0.5 rounded hover:bg-[var(--po-card-muted)] disabled:opacity-50"
                  disabled={busy || removingId === tool.id}
                  onClick={() => void handleRemove(tool.id)}
                  aria-label={t("projects.equipment.removeFromProject")}
                >
                  {removingId === tool.id ? (
                    <Loader2 className="size-3.5 animate-spin" />
                  ) : (
                    <X className="size-3.5" />
                  )}
                </button>
              ) : null}
            </li>
          ))}
        </ul>
      )}

      {canManage && availableTools.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border px-3 py-3 text-sm text-muted-foreground space-y-2">
          <p className="flex items-center gap-2">
            <Wrench className="size-4 shrink-0" />
            {t("projects.workPlan.noEquipmentHint")}
          </p>
          <Link
            href="/app/equipment/new"
            className="inline-flex text-sm font-semibold text-[#E95F2A] hover:underline"
          >
            {t("projects.equipment.createLink")} →
          </Link>
        </div>
      ) : null}

      <TaskToolsPicker
        open={pickerOpen}
        onOpenChange={setPickerOpen}
        tools={notYetOnProject}
        selected={[]}
        onSave={(tools) => void handleSave(tools)}
        t={t}
        mode="project"
      />
    </section>
  );
}
