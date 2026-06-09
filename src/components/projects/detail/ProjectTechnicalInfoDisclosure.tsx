"use client";

import { useState } from "react";
import { ChevronDown } from "lucide-react";
import type { ProjectDoc } from "@/lib/projects";
import { getProjectWorkType } from "@/lib/workTypes";
import { getProjectSummaryText } from "@/lib/projectDashboard";
import { useI18n } from "@/i18n/I18nContext";
import { cn } from "@/lib/utils";

type ProjectTechnicalInfoDisclosureProps = {
  project: ProjectDoc;
};

export function ProjectTechnicalInfoDisclosure({ project }: ProjectTechnicalInfoDisclosureProps) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const workType = getProjectWorkType(project);
  const fullBrief = getProjectSummaryText(project);

  const rows: { label: string; value: string; fullWidth?: boolean }[] = [
    ...(fullBrief
      ? [{ label: t("projects.dashboard.tech.fullBrief"), value: fullBrief, fullWidth: true }]
      : []),
    { label: t("projects.dashboard.tech.projectId"), value: project.id },
    ...(project.source
      ? [{ label: t("projects.dashboard.tech.source"), value: project.source }]
      : []),
    ...(workType
      ? [{ label: t("projects.dashboard.tech.workType"), value: workType }]
      : []),
    ...(project.jobArchetype
      ? [{ label: t("projects.dashboard.tech.archetype"), value: project.jobArchetype }]
      : []),
    ...(project.jobWorkflowKind
      ? [{ label: t("projects.dashboard.tech.workflow"), value: project.jobWorkflowKind }]
      : []),
    ...(project.lifecycleStatus
      ? [{ label: t("projects.dashboard.tech.lifecycle"), value: project.lifecycleStatus }]
      : []),
    ...(project.salesStatus
      ? [{ label: t("projects.dashboard.tech.salesStatus"), value: project.salesStatus }]
      : []),
    ...(project.quoteStatus
      ? [{ label: t("projects.dashboard.tech.quoteStatus"), value: project.quoteStatus }]
      : []),
    ...(project.customerId
      ? [{ label: t("projects.dashboard.tech.customerId"), value: project.customerId }]
      : []),
    ...(project.internalNote?.trim()
      ? [{ label: t("projects.dashboard.tech.internalNote"), value: project.internalNote.trim(), fullWidth: true }]
      : []),
  ];

  if (rows.length === 0) return null;

  return (
    <div className="rounded-lg border border-border/70">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between gap-2 px-4 py-3 text-left text-sm font-medium text-muted-foreground hover:text-foreground"
      >
        {t("projects.dashboard.tech.title")}
        <ChevronDown className={cn("size-4 transition-transform", open && "rotate-180")} />
      </button>
      {open ? (
        <dl className="border-t border-border/70 px-4 py-3 grid gap-3 sm:grid-cols-2 text-sm">
          {rows.map((row) => (
            <div key={row.label} className={row.fullWidth ? "sm:col-span-2" : undefined}>
              <dt className="text-xs text-muted-foreground">{row.label}</dt>
              <dd className="text-xs mt-0.5 break-words whitespace-pre-wrap">{row.value}</dd>
            </div>
          ))}
        </dl>
      ) : null}
    </div>
  );
}
