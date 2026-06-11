"use client";

import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import type { ProjectMemberRecord } from "@/services/projects/taskPlanningTypes";
import { cn } from "@/lib/utils";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  members: ProjectMemberRecord[];
  selectedId?: string | null;
  onSelect: (member: ProjectMemberRecord | null) => void;
  t: (key: string) => string;
};

export function TaskAssigneePicker({
  open,
  onOpenChange,
  members,
  selectedId,
  onSelect,
  t,
}: Props) {
  const [pending, setPending] = useState<string | null>(null);

  const handlePick = (member: ProjectMemberRecord | null) => {
    setPending(member?.userId ?? "__none__");
    onSelect(member);
    onOpenChange(false);
    setPending(null);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{t("projects.tasks.assignAssignee")}</DialogTitle>
        </DialogHeader>
        <ul className="max-h-72 overflow-y-auto divide-y divide-border">
          <li>
            <button
              type="button"
              className={cn(
                "w-full text-left px-3 py-2.5 text-sm hover:bg-muted/60 rounded-md",
                !selectedId && "bg-muted/40 font-medium"
              )}
              disabled={pending === "__none__"}
              onClick={() => handlePick(null)}
            >
              {t("projects.tasks.unassigned")}
            </button>
          </li>
          {members.map((member) => (
            <li key={member.userId}>
              <button
                type="button"
                className={cn(
                  "w-full text-left px-3 py-2.5 text-sm hover:bg-muted/60 rounded-md",
                  selectedId === member.userId && "bg-[#1D376A]/8 font-medium text-[#1D376A]"
                )}
                disabled={pending === member.userId}
                onClick={() => handlePick(member)}
              >
                <span className="block">{member.name?.trim() || member.email || member.userId}</span>
                {member.name && member.email ? (
                  <span className="block text-xs text-muted-foreground">{member.email}</span>
                ) : null}
              </button>
            </li>
          ))}
        </ul>
        <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
          {t("common.cancel")}
        </Button>
      </DialogContent>
    </Dialog>
  );
}
