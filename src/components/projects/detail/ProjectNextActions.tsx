"use client";

import { useState } from "react";
import Link from "next/link";
import { Button, buttonVariants } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { ProjectDoc } from "@/lib/projects";
import {
  getDashboardActions,
  getNextActionContent,
  type DashboardAction,
  type NextActionTone,
} from "@/lib/projectDashboard";
import {
  convertDraftToActiveProject,
  updateDraftJobStatus,
} from "@/services/projects";
import { useI18n } from "@/i18n/I18nContext";
import { cn } from "@/lib/utils";
import { AlertTriangle, ArrowRight, Loader2 } from "lucide-react";

type ProjectNextActionsProps = {
  project: ProjectDoc;
  userId: string;
  onProjectUpdated: (project: ProjectDoc) => void;
};

/** Solid, readable card tokens (no gradient, WCAG-AA contrast in both modes). */
const CARD =
  "rounded-2xl border border-[#D8E1EA] bg-white p-5 dark:border-[#334155] dark:bg-[#1E293B]";
const TITLE = "text-base font-semibold text-[#0F172A] dark:text-[#F8FAFC]";
const BLOCK_REASON = "text-sm text-[#64748B] dark:text-[#94A3B8]";
const DESCRIPTION = "text-sm text-[#334155] dark:text-[#CBD5E1]";
const PRIMARY_BTN = "bg-[#C9481D] text-white hover:bg-[#B8431D]";
const SECONDARY_BTN =
  "border border-[#D8E1EA] bg-white text-[#0F172A] hover:bg-[#F1F5F9] dark:border-[#334155] dark:bg-[#243247] dark:text-[#F8FAFC] dark:hover:bg-[#2C3D55]";

const statusToneClass: Record<NextActionTone, string> = {
  neutral: "text-[#334155] dark:text-[#CBD5E1]",
  attention: "text-[#B8431D] dark:text-[#FDBA74]",
  positive: "text-emerald-700 dark:text-emerald-300",
};

const badgeToneClass: Record<NextActionTone, string> = {
  neutral:
    "border-[#D8E1EA] bg-[#EEF2F7] text-[#334155] dark:border-[#334155] dark:bg-[#243247] dark:text-[#CBD5E1]",
  attention:
    "border-[#F1C8A8] bg-[#FCE7D6] text-[#B8431D] dark:border-[#7C2D12] dark:bg-[#332B27] dark:text-[#FDBA74]",
  positive:
    "border-emerald-300 bg-emerald-50 text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-300",
};

export function ProjectNextActions({
  project,
  userId,
  onProjectUpdated,
}: ProjectNextActionsProps) {
  const { t } = useI18n();
  const [busy, setBusy] = useState(false);
  const [convertOpen, setConvertOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const actions = getDashboardActions(project);
  const content = getNextActionContent(project);

  const runAction = async (action: DashboardAction) => {
    if (!action.action) return;
    setBusy(true);
    setError(null);
    try {
      if (action.action === "markQuoteSent") {
        const updated = await updateDraftJobStatus(project.id, "quote_sent", {
          quoteStatus: "sent",
          salesStatus: "quote_sent",
        });
        onProjectUpdated(updated);
      } else if (action.action === "markAccepted") {
        const updated = await updateDraftJobStatus(project.id, "accepted", {
          quoteStatus: "accepted",
          salesStatus: "accepted",
        });
        onProjectUpdated(updated);
      } else if (action.action === "convertActive") {
        setConvertOpen(true);
        setBusy(false);
        return;
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : t("projects.draft.actionError"));
    } finally {
      setBusy(false);
    }
  };

  const handleConvert = async () => {
    setBusy(true);
    setError(null);
    try {
      const updated = await convertDraftToActiveProject(project.id, userId);
      onProjectUpdated(updated);
      setConvertOpen(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : t("projects.draft.actionError"));
    } finally {
      setBusy(false);
    }
  };

  const primary = actions.filter((a) => a.variant === "primary");
  const secondary = actions.filter((a) => a.variant === "secondary");

  const renderAction = (action: DashboardAction, isPrimary: boolean) => {
    const className = isPrimary ? PRIMARY_BTN : SECONDARY_BTN;
    if (action.href) {
      return (
        <Link
          key={action.id}
          href={action.href}
          className={cn(buttonVariants({ variant: "default", size: "sm" }), className)}
        >
          {t(action.labelKey)}
          {isPrimary ? <ArrowRight className="ml-1 size-3.5" /> : null}
        </Link>
      );
    }
    return (
      <Button
        key={action.id}
        size="sm"
        disabled={busy}
        className={className}
        onClick={() => void runAction(action)}
      >
        {busy ? (
          <Loader2 className="size-4 animate-spin" />
        ) : (
          <>
            {t(action.labelKey)}
            {isPrimary ? <ArrowRight className="ml-1 size-3.5" /> : null}
          </>
        )}
      </Button>
    );
  };

  return (
    <>
      <section className={CARD} aria-label={t("projects.dashboard.next.title")}>
        <div className="flex items-start justify-between gap-3">
          <h2 className={TITLE}>{t("projects.dashboard.next.title")}</h2>
          {content.badgeKey ? (
            <span
              className={cn(
                "inline-flex shrink-0 items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-medium",
                badgeToneClass[content.badgeTone]
              )}
            >
              {content.badgeTone === "attention" ? (
                <AlertTriangle className="size-3" aria-hidden />
              ) : null}
              {t(content.badgeKey)}
            </span>
          ) : null}
        </div>

        <p className={cn("mt-2 text-sm font-semibold", statusToneClass[content.badgeTone])}>
          {t(content.statusKey)}
        </p>
        {content.blockReasonKey ? (
          <p className={cn(BLOCK_REASON, "mt-1")}>{t(content.blockReasonKey)}</p>
        ) : null}
        <p className={cn(DESCRIPTION, "mt-2")}>{t(content.descriptionKey)}</p>

        <div className="mt-4 flex flex-wrap gap-2">
          {primary.map((action) => renderAction(action, true))}
          {secondary.map((action) => renderAction(action, false))}
        </div>
        {error ? (
          <p className="mt-3 text-sm text-red-600 dark:text-red-400">{error}</p>
        ) : null}
      </section>

      <Dialog open={convertOpen} onOpenChange={setConvertOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("projects.dashboard.convert.title")}</DialogTitle>
            <DialogDescription>{t("projects.dashboard.convert.body")}</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConvertOpen(false)} disabled={busy}>
              {t("common.cancel")}
            </Button>
            <Button onClick={() => void handleConvert()} disabled={busy}>
              {busy ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                t("projects.draft.convertConfirm")
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
