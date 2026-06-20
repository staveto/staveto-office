"use client";

import { Camera, FileText, FolderOpen, Upload } from "lucide-react";
import type { ProjectOverviewViewModel } from "@/lib/projectOverviewViewModel";
import type { ProjectDashboardTab } from "@/lib/projectDashboard";
import { Button } from "@/components/ui/button";
import { useI18n } from "@/i18n/I18nContext";
import { cn } from "@/lib/utils";
import { po } from "./poStyles";

type Props = {
  documents: ProjectOverviewViewModel["documents"];
  onNavigate: (tab: ProjectDashboardTab) => void;
};

export function ProjectDocumentsProofCard({ documents, onNavigate }: Props) {
  const { t } = useI18n();
  const total = documents.photos + documents.documents + documents.reports;
  const empty = total === 0;

  return (
    <section className={cn(po.card, "p-4")}>
      <h2 className={cn(po.title, "mb-3 flex items-center gap-2")}>
        <FolderOpen className="size-4" aria-hidden />
        {t("projects.command.documents.title")}
      </h2>

      <div className="mb-3 grid grid-cols-3 gap-2">
        <DocStat
          icon={Camera}
          label={t("projects.command.documents.photos")}
          count={documents.photos}
        />
        <DocStat
          icon={FileText}
          label={t("projects.command.documents.files")}
          count={documents.documents}
        />
        <DocStat
          icon={FileText}
          label={t("projects.command.documents.reports")}
          count={documents.reports}
        />
      </div>

      {empty ? (
        <p className={cn(po.muted, "mb-3 text-sm")}>{t("projects.command.documents.empty")}</p>
      ) : null}

      <div className="flex flex-wrap gap-2">
        <Button size="sm" className={po.btnPrimary} onClick={() => onNavigate("documents")}>
          <Upload className="mr-1 size-4" />
          {t("projects.command.documents.upload")}
        </Button>
        <Button size="sm" variant="outline" className={po.btnOutline} onClick={() => onNavigate("documents")}>
          {t("projects.header.createReport")}
        </Button>
      </div>
    </section>
  );
}

function DocStat({
  icon: Icon,
  label,
  count,
}: {
  icon: typeof Camera;
  label: string;
  count: number;
}) {
  return (
    <div className={cn(po.cardMuted, "px-2 py-2 text-center")}>
      <Icon className="mx-auto mb-1 size-4 text-[var(--po-text-muted)]" aria-hidden />
      <p className="text-lg font-bold tabular-nums text-[var(--po-text-primary)]">{count}</p>
      <p className="text-[10px] text-[var(--po-text-muted)]">{label}</p>
    </div>
  );
}
