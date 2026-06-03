"use client";

import { useEffect, useState } from "react";
import { useI18n } from "@/i18n/I18nContext";
import { getFirestoreInstance } from "@/lib/firebase";
import { getOrganization, getMemberDisplayName } from "@/lib/organizations";
import {
  getAssignedMemberCount,
  getProjectOwnershipScope,
  isCompanyOwnedProject,
  type ProjectOwnershipPick,
} from "@/lib/projectOwnership";
import type { ProjectDoc } from "@/lib/projects";
import { ProjectOwnershipBadge } from "./ProjectOwnershipBadge";
import { cn } from "@/lib/utils";

type ProjectOwnershipMetaProps = {
  project: ProjectDoc;
  className?: string;
  variant?: "compact" | "panel";
};

export function ProjectOwnershipMeta({
  project,
  className,
  variant = "compact",
}: ProjectOwnershipMetaProps) {
  const { t } = useI18n();
  const scope = getProjectOwnershipScope(project);
  const [ownerLabel, setOwnerLabel] = useState<string | null>(null);
  const [companyLabel, setCompanyLabel] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const db = getFirestoreInstance();

    async function load() {
      if (isCompanyOwnedProject(project) && project.orgId) {
        const org = await getOrganization(project.orgId);
        if (!cancelled) {
          setCompanyLabel(org?.name ?? project.orgId.slice(0, 8));
        }
        setOwnerLabel(null);
        return;
      }

      if (project.ownerId && db) {
        const name = await getMemberDisplayName(db, project.ownerId);
        if (!cancelled) {
          setOwnerLabel(name ?? project.ownerId.slice(0, 8));
        }
      }
      setCompanyLabel(null);
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [project.orgId, project.ownerId]);

  const assignedCount = getAssignedMemberCount(project);

  const rows = [
    scope === "company"
      ? {
          label: t("projects.ownership.companyLabel"),
          value: companyLabel ?? "…",
        }
      : {
          label: t("projects.ownership.ownerLabel"),
          value: ownerLabel ?? "…",
        },
    {
      label: t("projects.ownership.assignedLabel"),
      value:
        assignedCount > 0
          ? t("projects.ownership.assignedCount", { count: assignedCount })
          : t("projects.ownership.noAssignees"),
    },
  ];

  if (variant === "panel") {
    return (
      <div
        className={cn(
          "rounded-lg border border-border/80 bg-muted/30 px-4 py-3 space-y-2",
          className
        )}
      >
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            {t("projects.ownership.scopeLabel")}
          </span>
          <ProjectOwnershipBadge project={project} />
        </div>
        <dl className="grid gap-2 sm:grid-cols-2 text-sm">
          {rows.map((row) => (
            <div key={row.label}>
              <dt className="text-muted-foreground text-xs">{row.label}</dt>
              <dd className="font-medium text-foreground mt-0.5">{row.value}</dd>
            </div>
          ))}
        </dl>
      </div>
    );
  }

  return (
    <div className={cn("flex flex-wrap items-center gap-x-3 gap-y-1.5 text-sm", className)}>
      <ProjectOwnershipBadge project={project as ProjectOwnershipPick} />
      <span className="text-muted-foreground">
        {rows[0].label}: <span className="text-foreground font-medium">{rows[0].value}</span>
      </span>
      <span className="text-muted-foreground hidden sm:inline">·</span>
      <span className="text-muted-foreground">{rows[1].value}</span>
    </div>
  );
}
