"use client";

import { useState } from "react";
import { HelpCircle } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useI18n } from "@/i18n/I18nContext";
import { cn } from "@/lib/utils";
import { po } from "./poStyles";

const STORAGE_KEY = "staveto.projectOverviewHintDismissed";

/** Small ? help control — hidden when user dismissed help permanently. */
export function ProjectCockpitHelpButton({ className }: { className?: string }) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const [dismissed, setDismissed] = useState(() => {
    if (typeof window === "undefined") return false;
    return window.localStorage.getItem(STORAGE_KEY) === "1";
  });

  if (dismissed) return null;

  const dismiss = () => {
    setDismissed(true);
    setOpen(false);
    try {
      window.localStorage.setItem(STORAGE_KEY, "1");
    } catch {
      /* ignore */
    }
  };

  return (
    <>
      <button
        type="button"
        className={cn(
          "inline-flex size-8 shrink-0 items-center justify-center rounded-full",
          "text-[var(--po-text-muted)] transition-colors hover:bg-[var(--po-card-muted)] hover:text-[var(--po-text-primary)]",
          className
        )}
        onClick={() => setOpen(true)}
        aria-label={t("projects.cockpit.hint.title")}
        title={t("projects.cockpit.hint.title")}
      >
        <HelpCircle className="size-4" />
      </button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{t("projects.cockpit.hint.title")}</DialogTitle>
          </DialogHeader>
          <p className={cn(po.body, "leading-relaxed")}>{t("projects.cockpit.hint.body")}</p>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" size="sm" onClick={() => setOpen(false)}>
              {t("common.cancel")}
            </Button>
            <Button variant="ghost" size="sm" className={po.btnGhost} onClick={dismiss}>
              {t("projects.cockpit.hint.dismiss")}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
