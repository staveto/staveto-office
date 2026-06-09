"use client";

import { useState } from "react";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
  getPrimaryActionSubtextKey,
  type DashboardAction,
} from "@/lib/projectDashboard";
import {
  convertDraftToActiveProject,
  updateDraftJobStatus,
} from "@/services/projects";
import { useI18n } from "@/i18n/I18nContext";
import { cn } from "@/lib/utils";
import { Loader2 } from "lucide-react";

type ProjectNextActionsProps = {
  project: ProjectDoc;
  userId: string;
  onProjectUpdated: (project: ProjectDoc) => void;
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
  const subtextKey = getPrimaryActionSubtextKey(project);

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

  return (
    <>
      <Card className="border-[#1D376A]/15 bg-gradient-to-br from-white to-[#1D376A]/3">
        <CardHeader className="pb-2">
          <CardTitle className="text-base text-[#1D376A]">
            {t("projects.dashboard.nextActions.titleShort")}
          </CardTitle>
          {subtextKey ? (
            <p className="text-sm text-muted-foreground font-normal">{t(subtextKey)}</p>
          ) : null}
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-wrap gap-2">
            {primary.map((action) =>
              action.href ? (
                <Link
                  key={action.id}
                  href={action.href}
                  className={cn(
                    buttonVariants({ variant: "default", size: "sm" }),
                    "bg-[#e06737] hover:bg-[#c9582f] text-white"
                  )}
                >
                  {t(action.labelKey)}
                </Link>
              ) : (
                <Button
                  key={action.id}
                  size="sm"
                  disabled={busy}
                  className="bg-[#e06737] hover:bg-[#c9582f] text-white"
                  onClick={() => void runAction(action)}
                >
                  {busy ? <Loader2 className="size-4 animate-spin" /> : t(action.labelKey)}
                </Button>
              )
            )}
          </div>
          {secondary.length > 0 ? (
            <div className="flex flex-wrap gap-2">
              {secondary.map((action) =>
                action.href ? (
                  <Link
                    key={action.id}
                    href={action.href}
                    className={buttonVariants({ variant: "outline", size: "sm" })}
                  >
                    {t(action.labelKey)}
                  </Link>
                ) : (
                  <Button
                    key={action.id}
                    variant="outline"
                    size="sm"
                    disabled={busy}
                    onClick={() => void runAction(action)}
                  >
                    {t(action.labelKey)}
                  </Button>
                )
              )}
            </div>
          ) : null}
          {error ? <p className="text-sm text-destructive">{error}</p> : null}
        </CardContent>
      </Card>

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
