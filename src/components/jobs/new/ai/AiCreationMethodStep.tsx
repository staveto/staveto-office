"use client";

import { Check, Copy, PenLine, Sparkles } from "lucide-react";
import { useI18n } from "@/i18n/I18nContext";
import { isAiProjectCreationEnabled } from "@/lib/projectCreationFeature";
import { cn } from "@/lib/utils";
import { nj, njLargeChoice } from "../newJobFormStyles";
import type { CreationMethod } from "../newJobWizardTypes";

type Props = {
  value: CreationMethod | null;
  onChange: (method: CreationMethod) => void;
  copyAvailable: boolean;
  error?: string;
};

export function AiCreationMethodStep({ value, onChange, copyAvailable, error }: Props) {
  const { t } = useI18n();
  const aiCreationOn = isAiProjectCreationEnabled();

  const options = [
    ...(aiCreationOn
      ? [
          {
            id: "ai" as const,
            icon: Sparkles,
            title: t("projects.new.method.aiPrimary"),
            desc: t("projects.new.method.aiPrimaryDesc"),
            disabled: false,
          },
        ]
      : []),
    {
      id: "manual" as const,
      icon: PenLine,
      title: t("projects.new.method.manualPrimary"),
      desc: t("projects.new.method.manualPrimaryDesc"),
      disabled: false,
    },
    {
      id: "copy" as const,
      icon: Copy,
      title: t("projects.new.method.copy"),
      desc: t("projects.new.method.copyDesc"),
      disabled: !copyAvailable,
    },
  ];

  return (
    <div className="space-y-4">
      <p className={cn("text-[15px] leading-relaxed max-w-2xl", nj.choiceCardHint)}>
        {t("projects.new.method.lead")}
      </p>
      <div className="space-y-3" role="radiogroup" aria-label={t("projects.new.step3Title")}>
        {options.map(({ id, icon: Icon, title, desc, disabled }) => {
          const selected = value === id;
          return (
            <button
              key={id}
              type="button"
              role="radio"
              aria-checked={selected}
              disabled={disabled}
              title={disabled ? t("projects.new.copy.empty") : undefined}
              onClick={() => {
                if (disabled) return;
                onChange(id);
              }}
              className={cn(
                njLargeChoice(selected),
                disabled && "opacity-55 cursor-not-allowed hover:border-[#CBD5E1]"
              )}
            >
              <div
                className={cn(
                  "flex size-12 shrink-0 items-center justify-center rounded-xl border-2",
                  selected
                    ? "bg-[#E95F2A] border-[#E95F2A] text-white"
                    : "bg-[#EEF2F7] border-[#CBD5E1] text-[#475569] dark:bg-[#334155] dark:border-[#475569] dark:text-[#CBD5E1]"
                )}
              >
                <Icon className="size-6" aria-hidden />
              </div>
              <span className="min-w-0 flex-1 text-left">
                <span className="flex items-center gap-2">
                  <span className={cn("block text-base font-bold", nj.choiceCardTitle)}>{title}</span>
                  {selected ? (
                    <span
                      className="flex size-6 items-center justify-center rounded-full bg-[#E95F2A] text-white shrink-0"
                      aria-hidden
                    >
                      <Check className="size-3.5" strokeWidth={3} />
                    </span>
                  ) : null}
                </span>
                <span className={cn("block text-sm mt-1", nj.choiceCardHint)}>{desc}</span>
              </span>
            </button>
          );
        })}
      </div>
      {error ? (
        <p className="text-sm text-destructive" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
