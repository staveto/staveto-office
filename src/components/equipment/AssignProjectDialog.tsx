"use client";

import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useI18n } from "@/i18n/I18nContext";
import { useAuth } from "@/context/AuthContext";
import { useWorkspace } from "@/context/WorkspaceContext";
import { listProjectsForWorkspace, type ProjectDoc } from "@/lib/projects";

type AssignProjectDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  currentProjectId?: string | null;
  onSelect: (projectId: string | null) => Promise<void>;
};

export function AssignProjectDialog({
  open,
  onOpenChange,
  currentProjectId,
  onSelect,
}: AssignProjectDialogProps) {
  const { t } = useI18n();
  const { user } = useAuth();
  const { activeWorkspace } = useWorkspace();
  const [projects, setProjects] = useState<ProjectDoc[]>([]);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState<string | null>(null);

  useEffect(() => {
    if (!open || !user?.id || !activeWorkspace) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const list = await listProjectsForWorkspace(activeWorkspace, user.id);
        if (!cancelled) setProjects(list);
      } catch {
        if (!cancelled) setProjects([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, user?.id, activeWorkspace]);

  const handlePick = async (projectId: string | null) => {
    setSubmitting(projectId ?? "__none");
    try {
      await onSelect(projectId);
      onOpenChange(false);
    } finally {
      setSubmitting(null);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{t("equipmentTab.pickProject")}</DialogTitle>
        </DialogHeader>
        {loading ? (
          <div className="flex justify-center py-8">
            <Loader2 className="size-6 animate-spin text-muted-foreground" />
          </div>
        ) : projects.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">
            {t("equipmentTab.assignNoOrg")}
          </p>
        ) : (
          <div className="max-h-80 overflow-y-auto divide-y">
            {currentProjectId && (
              <Button
                type="button"
                variant="ghost"
                className="w-full justify-start h-auto py-3 text-destructive"
                disabled={!!submitting}
                onClick={() => void handlePick(null)}
              >
                {submitting === "__none" ? (
                  <Loader2 className="size-4 mr-2 animate-spin" />
                ) : null}
                {t("equipmentTab.unassignProject")}
              </Button>
            )}
            {projects.map((p) => (
              <Button
                key={p.id}
                type="button"
                variant="ghost"
                className="w-full justify-start h-auto py-3 font-normal"
                disabled={!!submitting}
                onClick={() => void handlePick(p.id)}
              >
                {submitting === p.id ? (
                  <Loader2 className="size-4 mr-2 animate-spin shrink-0" />
                ) : null}
                <span className="truncate">{p.name}</span>
              </Button>
            ))}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
