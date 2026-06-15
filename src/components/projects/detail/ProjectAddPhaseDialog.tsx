"use client";

import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  defaultOrder?: number;
  onCreate: (input: { name: string; order: number; addStarterTask: boolean }) => Promise<void>;
  t: (key: string, params?: Record<string, string | number>) => string;
};

export function ProjectAddPhaseDialog({
  open,
  onOpenChange,
  defaultOrder = 0,
  onCreate,
  t,
}: Props) {
  const [name, setName] = useState("");
  const [order, setOrder] = useState(String(defaultOrder));
  const [addStarter, setAddStarter] = useState(true);
  const [busy, setBusy] = useState(false);

  const handleCreate = async () => {
    if (!name.trim() || busy) return;
    setBusy(true);
    try {
      await onCreate({
        name: name.trim(),
        order: Number(order) || defaultOrder,
        addStarterTask: addStarter,
      });
      setName("");
      onOpenChange(false);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{t("projects.planning.addPhaseTitle")}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label htmlFor="phase-name">{t("projects.planning.phaseName")}</Label>
            <Input
              id="phase-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={t("projects.planning.phaseNamePlaceholder")}
            />
          </div>
          <div>
            <Label htmlFor="phase-order">{t("projects.planning.phaseOrder")}</Label>
            <Input
              id="phase-order"
              type="number"
              min={0}
              value={order}
              onChange={(e) => setOrder(e.target.value)}
            />
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={addStarter}
              onChange={(e) => setAddStarter(e.target.checked)}
            />
            {t("projects.planning.addStarterTask")}
          </label>
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            {t("common.cancel")}
          </Button>
          <Button
            type="button"
            className="bg-[#1D376A] hover:bg-[#162d58]"
            disabled={busy || !name.trim()}
            onClick={() => void handleCreate()}
          >
            {t("projects.planning.createPhase")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
