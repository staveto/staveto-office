"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import type { TaskToolSnapshot } from "@/services/projects/taskPlanningTypes";
import { cn } from "@/lib/utils";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  tools: TaskToolSnapshot[];
  selected: TaskToolSnapshot[];
  onSave: (tools: TaskToolSnapshot[]) => void;
  t: (key: string) => string;
  /** task = assign snapshot to task; project = link equipment to project */
  mode?: "task" | "project";
};

export function TaskToolsPicker({
  open,
  onOpenChange,
  tools,
  selected,
  onSave,
  t,
  mode = "task",
}: Props) {
  const [picked, setPicked] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (open) {
      setPicked(new Set(selected.map((s) => s.id)));
    }
  }, [open, selected]);

  const toggle = (id: string) => {
    setPicked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleSave = () => {
    const result = tools.filter((tool) => picked.has(tool.id));
    onSave(result);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>
            {mode === "project"
              ? t("projects.equipment.addToProject")
              : t("projects.tasks.assignTools")}
          </DialogTitle>
        </DialogHeader>
        {tools.length === 0 ? (
          <div className="py-4 space-y-3">
            <p className="text-sm text-muted-foreground">{t("projects.tasks.noToolsAvailable")}</p>
            <Link
              href="/app/equipment/new"
              className="inline-flex text-sm font-semibold text-[#E95F2A] hover:underline"
            >
              {t("projects.equipment.createLink")} →
            </Link>
          </div>
        ) : (
          <ul className="max-h-72 overflow-y-auto space-y-1">
            {tools.map((tool) => (
              <li key={tool.id}>
                <label
                  className={cn(
                    "flex items-start gap-3 px-3 py-2 rounded-md cursor-pointer hover:bg-muted/50",
                    picked.has(tool.id) && "bg-[#1D376A]/8"
                  )}
                >
                  <input
                    type="checkbox"
                    className="mt-1 accent-[#1D376A]"
                    checked={picked.has(tool.id)}
                    onChange={() => toggle(tool.id)}
                  />
                  <span className="text-sm">
                    <span className="font-medium block">{tool.name}</span>
                    {tool.type ? (
                      <span className="text-xs text-muted-foreground">{tool.type}</span>
                    ) : null}
                  </span>
                </label>
              </li>
            ))}
          </ul>
        )}
        <div className="flex gap-2 justify-end">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            {t("common.cancel")}
          </Button>
          <Button type="button" className="bg-[#1D376A]" onClick={handleSave}>
            {t("common.save")}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
