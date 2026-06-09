"use client";

import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import type { ProjectDoc } from "@/lib/projects";
import { excerptText, getProjectSummaryText } from "@/lib/projectDashboard";
import { ProjectNextActions } from "./ProjectNextActions";
import { ProjectTechnicalInfoDisclosure } from "./ProjectTechnicalInfoDisclosure";
import { ProjectOwnershipMeta } from "@/components/projects/ProjectOwnershipMeta";
import { useI18n } from "@/i18n/I18nContext";

type ProjectOverviewTabProps = {
  project: ProjectDoc;
  userId: string;
  onProjectUpdated: (project: ProjectDoc) => void;
};

export function ProjectOverviewTab({
  project,
  userId,
  onProjectUpdated,
}: ProjectOverviewTabProps) {
  const { t } = useI18n();
  const [infoOpen, setInfoOpen] = useState(false);
  const fullSummary = getProjectSummaryText(project);
  const excerpt = excerptText(fullSummary, 220);
  const hasMore = fullSummary.length > excerpt.length;

  return (
    <div className="space-y-6">
      <ProjectNextActions
        project={project}
        userId={userId}
        onProjectUpdated={onProjectUpdated}
      />

      {excerpt ? (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base text-[#1D376A]">
              {t("projects.dashboard.summary.title")}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-sm text-foreground leading-relaxed">{excerpt}</p>
            {hasMore ? (
              <Button variant="link" className="h-auto p-0 text-[#e06737]" onClick={() => setInfoOpen(true)}>
                {t("projects.dashboard.summary.showMore")}
              </Button>
            ) : null}
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base text-[#1D376A]">
            {t("projects.dashboard.contactCard.title")}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <dl className="grid gap-3 sm:grid-cols-2 text-sm">
            <div>
              <dt className="text-muted-foreground">{t("projects.draft.customerEmail")}</dt>
              <dd className="font-medium mt-0.5">
                {project.customerEmail?.trim() || t("projects.dashboard.notSet")}
              </dd>
            </div>
            <div>
              <dt className="text-muted-foreground">{t("projects.draft.customerPhone")}</dt>
              <dd className="font-medium mt-0.5">
                {project.customerPhone?.trim() || t("projects.dashboard.notSet")}
              </dd>
            </div>
          </dl>
        </CardContent>
      </Card>

      <ProjectOwnershipMeta project={project} variant="panel" />

      <ProjectTechnicalInfoDisclosure project={project} />

      <Dialog open={infoOpen} onOpenChange={setInfoOpen}>
        <DialogContent className="sm:max-w-lg max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{t("projects.dashboard.summary.modalTitle")}</DialogTitle>
          </DialogHeader>
          <p className="text-sm whitespace-pre-wrap leading-relaxed">{fullSummary}</p>
        </DialogContent>
      </Dialog>
    </div>
  );
}
