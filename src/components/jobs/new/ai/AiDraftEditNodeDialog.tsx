"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useI18n } from "@/i18n/I18nContext";
import { nj } from "../newJobFormStyles";

export type AiDraftEditTarget =
  | { kind: "phase"; phaseId: string; title: string; description?: string }
  | { kind: "task"; phaseId: string; taskId: string; title: string; description?: string };

type Props = {
  target: AiDraftEditTarget | null;
  onClose: () => void;
  onSave: (target: AiDraftEditTarget, patch: { title: string; description: string }) => void;
};

export function AiDraftEditNodeDialog({ target, onClose, onSave }: Props) {
  const { t } = useI18n();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");

  useEffect(() => {
    if (target) {
      setTitle(target.title);
      setDescription(target.description ?? "");
    }
  }, [target]);

  const handleSave = () => {
    if (!target || !title.trim()) return;
    onSave(target, { title: title.trim(), description: description.trim() });
    onClose();
  };

  const dialogTitle =
    target?.kind === "task"
      ? t("projects.new.ai.workspace.editTask")
      : t("projects.new.ai.workspace.editPhase");

  return (
    <Dialog open={!!target} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-md" showCloseButton>
        <DialogHeader>
          <DialogTitle>{dialogTitle}</DialogTitle>
        </DialogHeader>

        {target ? (
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="ai-edit-title" className={nj.label}>
                {t("projects.new.ai.workspace.editNameLabel")}
              </Label>
              <Input
                id="ai-edit-title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className={nj.input}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="ai-edit-desc" className={nj.label}>
                {t("projects.new.ai.workspace.editDescLabel")}
              </Label>
              <Textarea
                id="ai-edit-desc"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={4}
                className={nj.textarea}
                placeholder={t("projects.new.ai.workspace.editDescPlaceholder")}
              />
            </div>
          </div>
        ) : null}

        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose}>
            {t("common.cancel")}
          </Button>
          <Button type="button" onClick={handleSave} disabled={!title.trim()}>
            {t("projects.new.ai.workspace.saveEdit")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
