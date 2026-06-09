"use client";

import { cn } from "@/lib/utils";
import { useI18n } from "@/i18n/I18nContext";
import type { AiSetupStepId } from "./aiSetupTypes";
import { AI_SETUP_STEPS } from "./aiSetupTypes";

type Props = {
  activeStep: AiSetupStepId;
  onStepClick?: (step: AiSetupStepId) => void;
};

export function AiSetupStepper({ activeStep, onStepClick }: Props) {
  const { t } = useI18n();
  const activeIndex = AI_SETUP_STEPS.indexOf(activeStep);

  return (
    <nav
      className="flex flex-wrap gap-2"
      aria-label={t("projects.aiSetup.stepperAria")}
    >
      {AI_SETUP_STEPS.map((step, index) => {
        const active = step === activeStep;
        const done = index < activeIndex;
        return (
          <button
            key={step}
            type="button"
            onClick={() => onStepClick?.(step)}
            disabled={!onStepClick}
            className={cn(
              "rounded-full px-3 py-1.5 text-xs sm:text-sm font-bold transition-colors border-2",
              active
                ? "border-[#E95F2A] bg-[#FFF8F5] text-[#E95F2A]"
                : done
                  ? "border-[#CBD5E1] bg-white text-[#334155]"
                  : "border-[#E2E8F0] bg-[#F8FAFC] text-[#94A3B8]"
            )}
          >
            {index + 1}. {t(`projects.aiSetup.step.${step}`)}
          </button>
        );
      })}
    </nav>
  );
}
