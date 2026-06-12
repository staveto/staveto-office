"use client";

import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { hideTimeEntryGpsLocation, type HideGpsPart } from "@/services/attendance/timeEntryGpsModerationService";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  entryId: string | null;
  part: HideGpsPart | null;
  hiddenByUid: string;
  t: (key: string, params?: Record<string, string | number>) => string;
  onSuccess: () => void;
  onError: (message: string) => void;
};

export function HideGpsLocationDialog({
  open,
  onOpenChange,
  entryId,
  part,
  hiddenByUid,
  t,
  onSuccess,
  onError,
}: Props) {
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);

  const handleClose = (next: boolean) => {
    if (!busy) {
      if (!next) setReason("");
      onOpenChange(next);
    }
  };

  const handleConfirm = async () => {
    if (!entryId || !part) return;
    setBusy(true);
    try {
      await hideTimeEntryGpsLocation({
        entryId,
        part,
        reason,
        hiddenByUid,
      });
      setReason("");
      onOpenChange(false);
      onSuccess();
    } catch (e) {
      onError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t("operations.gps.hideLocationTitle")}</DialogTitle>
          <DialogDescription>{t("operations.gps.hideLocationDescription")}</DialogDescription>
        </DialogHeader>
        <div>
          <label htmlFor="gps-hide-reason" className="text-sm font-semibold text-foreground">
            {t("operations.gps.hideLocationReason")}
          </label>
          <textarea
            id="gps-hide-reason"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            rows={3}
            className="mt-2 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-[#1D376A]/30"
            placeholder={t("operations.gps.hideLocationReason")}
          />
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" disabled={busy} onClick={() => handleClose(false)}>
            {t("common.cancel")}
          </Button>
          <Button type="button" disabled={busy || !entryId || !part} onClick={() => void handleConfirm()}>
            {t("operations.gps.hideLocation")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
