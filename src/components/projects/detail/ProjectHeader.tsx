"use client";

import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import type { ProjectDoc } from "@/lib/projects";
import {
  getCustomerContact,
  getCustomerDisplayName,
  getHumanWorkflowStatusKey,
  getLocationDisplay,
} from "@/lib/projectDashboard";
import { JobSourceBadge } from "@/components/jobs/JobSourceBadge";
import { WorkTypeBadge } from "@/components/jobs/WorkTypeBadge";
import { ProjectActionsMenu } from "@/components/projects/ProjectActionsMenu";
import { useI18n } from "@/i18n/I18nContext";
import type { WorkspaceRole } from "@/types/workspace";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";

type ProjectHeaderProps = {
  project: ProjectDoc;
  userId: string;
  role?: WorkspaceRole;
  onProjectUpdated: (project: ProjectDoc) => void;
  onActionToast: (key: string) => void;
  className?: string;
};

export function ProjectHeader({
  project,
  userId,
  role,
  onProjectUpdated,
  onActionToast,
  className,
}: ProjectHeaderProps) {
  const { t } = useI18n();
  const customer = getCustomerDisplayName(project);
  const contact = getCustomerContact(project);
  const location = getLocationDisplay(project);
  const statusKey = getHumanWorkflowStatusKey(project);

  return (
    <div className={cn("space-y-4", className)}>
      <Link
        href="/app/projects"
        className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-[#1D376A]"
      >
        <ArrowLeft className="size-4" />
        {t("projects.titleJobs")}
      </Link>

      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="space-y-3 min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <Badge
              variant="outline"
              className="font-normal border-[#1D376A]/30 bg-[#1D376A]/8 text-[#1D376A]"
            >
              {t(`projects.workflow.status.${statusKey}`)}
            </Badge>
            <WorkTypeBadge project={project} />
            <JobSourceBadge project={project} />
          </div>

          <h1 className="text-2xl font-semibold text-[#1D376A] leading-tight">
            {project.name || t("projects.noName")}
          </h1>

          <dl className="grid gap-x-6 gap-y-2 sm:grid-cols-2 text-sm">
            <div>
              <dt className="text-muted-foreground">{t("projects.dashboard.header.customer")}</dt>
              <dd className="font-medium text-foreground mt-0.5">
                {customer || t("projects.dashboard.notSet")}
              </dd>
            </div>
            <div>
              <dt className="text-muted-foreground">{t("projects.dashboard.header.contact")}</dt>
              <dd className="font-medium text-foreground mt-0.5">
                {contact || t("projects.dashboard.notSet")}
              </dd>
            </div>
            <div>
              <dt className="text-muted-foreground">{t("projects.dashboard.header.location")}</dt>
              <dd className="font-medium text-foreground mt-0.5">
                {location || t("projects.dashboard.notSet")}
              </dd>
            </div>
          </dl>
        </div>

        <div className="flex shrink-0 items-start gap-2">
          <ProjectActionsMenu
            project={project}
            userId={userId}
            role={role}
            variant="detail"
            onProjectUpdated={onProjectUpdated}
            onActionComplete={onActionToast}
          />
        </div>
      </div>
    </div>
  );
}
