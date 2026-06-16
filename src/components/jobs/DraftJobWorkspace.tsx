"use client";

import { useState } from "react";
import Link from "next/link";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button, buttonVariants } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { useI18n } from "@/i18n/I18nContext";
import type { ProjectDoc } from "@/lib/projects";
import { JobLifecycleBadge } from "./JobLifecycleBadge";
import { JobSourceBadge } from "./JobSourceBadge";
import { WorkTypeBadge } from "./WorkTypeBadge";
import { getProjectWorkType } from "@/lib/workTypes";
import {
  convertDraftToActiveProject,
  updateDraftJobStatus,
} from "@/services/projects";
import { DraftQuoteItemsPanel } from "./DraftQuoteItemsPanel";
import { DraftJobNextSteps } from "./new/DraftJobNextSteps";

const MISSING_ITEMS = [
  "scope",
  "address",
  "deadline",
  "budget",
  "contacts",
] as const;

type DraftJobWorkspaceProps = {
  project: ProjectDoc;
  userId: string;
  onProjectUpdated: (project: ProjectDoc) => void;
};

export function DraftJobWorkspace({
  project,
  userId,
  onProjectUpdated,
}: DraftJobWorkspaceProps) {
  const { t } = useI18n();
  const [convertOpen, setConvertOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const runStatus = async (
    status: Parameters<typeof updateDraftJobStatus>[1],
    extra?: Parameters<typeof updateDraftJobStatus>[2]
  ) => {
    setBusy(true);
    setError(null);
    try {
      const updated = await updateDraftJobStatus(project.id, status, extra);
      onProjectUpdated(updated);
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

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <WorkTypeBadge project={project} />
        <JobLifecycleBadge project={project} />
        <JobSourceBadge source={project.source} />
      </div>

      {getProjectWorkType(project) ? (
        <p className="text-xs text-muted-foreground border-l-2 border-[#1D376A]/30 pl-3">
          {t("projects.draft.workTypeAiNote")}
        </p>
      ) : null}

      <p className="text-sm text-muted-foreground">{t("projects.draft.hint")}</p>

      <DraftJobNextSteps project={project} />

      <div className="flex flex-wrap gap-2">
        <a
          href="#quote-items"
          className={cn(buttonVariants({ variant: "outline", size: "sm" }))}
        >
          {t("projects.draft.prepareQuote")}
        </a>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={busy}
          onClick={() =>
            runStatus("needs_customer_input", { salesStatus: "waiting_for_customer" })
          }
        >
          {t("projects.draft.waitingCustomer")}
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={busy}
          onClick={() => runStatus("accepted", { salesStatus: "accepted" })}
        >
          {t("projects.draft.markAccepted")}
        </Button>
        <Button
          type="button"
          size="sm"
          disabled={busy}
          className="bg-[#e06737] hover:bg-[#c95a30] text-white"
          onClick={() => setConvertOpen(true)}
        >
          {t("projects.draft.convert")}
        </Button>
      </div>

      {error ? <p className="text-sm text-destructive">{error}</p> : null}

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">{t("projects.draft.sectionRequest")}</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm whitespace-pre-wrap">
            {project.customerRequest || "—"}
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">{t("projects.draft.sectionContact")}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-1 text-sm">
          <p>
            <span className="text-muted-foreground">{t("projects.draft.customerName")}: </span>
            {project.customerName || "—"}
          </p>
          <p>
            <span className="text-muted-foreground">{t("projects.draft.customerEmail")}: </span>
            {project.customerEmail || "—"}
          </p>
          <p>
            <span className="text-muted-foreground">{t("projects.draft.customerPhone")}: </span>
            {project.customerPhone || "—"}
          </p>
          {(project.addressText || project.city) && (
            <p>
              <span className="text-muted-foreground">{t("projects.addressCol")}: </span>
              {[project.addressText, project.city].filter(Boolean).join(", ")}
            </p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">{t("projects.draft.sectionDocuments")}</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">{t("projects.draft.materialsPlaceholder")}</p>
        </CardContent>
      </Card>

      <div id="quote-items">
        <DraftQuoteItemsPanel
          project={project}
          userId={userId}
          onProjectUpdated={onProjectUpdated}
        />
      </div>

      <Card className="border-dashed">
        <CardHeader className="pb-2">
          <CardTitle className="text-base">{t("projects.draft.sectionAi")}</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">{t("projects.draft.aiPlaceholder")}</p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">{t("projects.draft.sectionMissing")}</CardTitle>
        </CardHeader>
        <CardContent>
          <ul className="space-y-2 text-sm" role="list">
            {MISSING_ITEMS.map((id) => (
              <li key={id} className="flex items-center gap-2 text-muted-foreground">
                <span className="size-4 rounded border border-border" aria-hidden />
                {t(`projects.draft.missing.${id}`)}
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">{t("projects.draft.sectionActivity")}</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">{t("projects.draft.activityPlaceholder")}</p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">{t("projects.draft.sectionEmail")}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          <p className="text-sm text-muted-foreground">{t("projects.draft.emailPlaceholder")}</p>
          <Link
            href="/app/inbox"
            className="inline-flex text-sm font-medium text-[#1D376A] hover:underline"
          >
            {t("inbox.title")} →
          </Link>
        </CardContent>
      </Card>

      <Dialog open={convertOpen} onOpenChange={setConvertOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("projects.draft.convertTitle")}</DialogTitle>
            <DialogDescription>{t("projects.draft.convertDescription")}</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setConvertOpen(false)}>
              {t("common.cancel")}
            </Button>
            <Button
              type="button"
              disabled={busy}
              className="bg-[#e06737] hover:bg-[#c95a30] text-white"
              onClick={handleConvert}
            >
              {t("projects.draft.convertConfirm")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
