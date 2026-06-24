"use client";

import { useI18n } from "@/i18n/I18nContext";
import { cn } from "@/lib/utils";
import { njLargeChoice } from "../newJobFormStyles";

export type CopyOptionsState = {
  copyTasks: boolean;
  copyQuoteItems: boolean;
  copyNotes: boolean;
  copyDocuments: boolean;
};

type Props = {
  value: CopyOptionsState;
  onChange: (patch: Partial<CopyOptionsState>) => void;
  sourceProjectName?: string;
};

const OPTIONS: { key: keyof CopyOptionsState; labelKey: string }[] = [
  { key: "copyTasks", labelKey: "projects.new.copy.copyTasks" },
  { key: "copyQuoteItems", labelKey: "projects.new.copy.copyQuoteItems" },
  { key: "copyNotes", labelKey: "projects.new.copy.copyNotes" },
  { key: "copyDocuments", labelKey: "projects.new.copy.copyDocuments" },
];

export function CopyOptionsStep({ value, onChange, sourceProjectName }: Props) {
  const { t } = useI18n();

  return (
    <div className="space-y-4 max-w-2xl">
      <p className="text-[15px] text-[#64748B] leading-relaxed">
        {t("projects.new.step.copyOptionsLead")}
      </p>
      {sourceProjectName ? (
        <p className="rounded-xl bg-[#F6F8FB] px-5 py-3 text-sm font-medium text-[#0F2A4D]">
          {t("projects.new.copy.sourceLabel", { name: sourceProjectName })}
        </p>
      ) : null}
      <div className="space-y-2" role="group" aria-label={t("projects.new.step.copyOptionsTitle")}>
        {OPTIONS.map(({ key, labelKey }) => {
          const checked = value[key];
          return (
            <button
              key={key}
              type="button"
              role="checkbox"
              aria-checked={checked}
              onClick={() => onChange({ [key]: !checked })}
              className={cn(njLargeChoice(checked), "w-full text-left")}
            >
              <span className="text-base font-semibold text-[#0F2A4D]">{t(labelKey)}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
