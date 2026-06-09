"use client";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useI18n } from "@/i18n/I18nContext";
import type { ProjectDoc } from "@/lib/projects";
import { getProjectWorkType, workTypeLabelKey } from "@/lib/workTypes";

type Props = {
  project: ProjectDoc;
  phaseCount: number;
  taskCount: number;
  materialCount: number;
  onContinue: () => void;
};

export function AiSetupOverviewStep({
  project,
  phaseCount,
  taskCount,
  materialCount,
  onContinue,
}: Props) {
  const { t } = useI18n();
  const workType = getProjectWorkType(project);
  const customerLine =
    project.customerCompanyName?.trim() ||
    project.customerName?.trim() ||
    t("projects.aiSetup.noCustomer");
  const contactPerson = project.customerContactPersonName?.trim();

  return (
    <div className="space-y-6">
      <div className="rounded-[18px] border-2 border-[#CBD5E1] bg-white p-6 space-y-4">
        <div className="flex flex-wrap items-center gap-2">
          <Badge className="bg-[#FFF3EC] text-[#E95F2A] border-[#E95F2A]/30 hover:bg-[#FFF3EC]">
            {t("projects.aiSetup.badgeDraft")}
          </Badge>
        </div>
        <dl className="grid gap-4 sm:grid-cols-2 text-sm">
          <Item label={t("projects.aiSetup.field.project")} value={project.name || "—"} />
          <Item label={t("projects.aiSetup.field.customer")} value={customerLine} />
          {contactPerson ? (
            <Item label={t("projects.aiSetup.field.contactPerson")} value={contactPerson} />
          ) : null}
          {workType ? (
            <Item label={t("projects.aiSetup.field.workType")} value={t(workTypeLabelKey(workType))} />
          ) : null}
          <Item label={t("projects.aiSetup.field.phases")} value={String(phaseCount)} />
          <Item label={t("projects.aiSetup.field.tasks")} value={String(taskCount)} />
          <Item label={t("projects.aiSetup.field.materials")} value={String(materialCount)} />
        </dl>
        {project.customerRequest?.trim() ? (
          <div>
            <p className="text-xs font-bold uppercase tracking-wide text-[#64748B] mb-1">
              {t("projects.aiSetup.field.summary")}
            </p>
            <p className="text-sm text-[#334155] leading-relaxed">{project.customerRequest.trim()}</p>
          </div>
        ) : null}
        <p className="text-sm text-[#64748B] leading-relaxed border-l-4 border-[#E95F2A]/40 pl-3">
          {t("projects.aiSetup.overview.hint")}
        </p>
      </div>
      <Button
        type="button"
        className="bg-[#E95F2A] hover:bg-[#D94F1F] h-11 text-base font-semibold px-8"
        onClick={onContinue}
      >
        {t("projects.aiSetup.cta.toMaterial")}
      </Button>
    </div>
  );
}

function Item({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-[#64748B] text-xs font-semibold uppercase tracking-wide">{label}</dt>
      <dd className="font-semibold text-[#0F2A4D] mt-0.5">{value}</dd>
    </div>
  );
}
