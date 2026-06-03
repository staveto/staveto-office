"use client";

import { Check } from "lucide-react";
import { cn } from "@/lib/utils";
import { useI18n } from "@/i18n/I18nContext";

export type NewJobStepId =
  | "type"
  | "contact"
  | "method"
  | "manual-details"
  | "ai-brief"
  | "ai-review"
  | "concept";

type Step = { id: NewJobStepId; label: string; done: boolean };

type Props = {
  steps: Step[];
  activeId: NewJobStepId;
};

export function NewJobStepper({ steps, activeId }: Props) {
  const { t } = useI18n();
  return (
    <nav
      className="flex flex-wrap items-center gap-3 sm:gap-4"
      aria-label={t("projects.new.stepper.aria")}
    >
      {steps.map((step, index) => {
        const active = step.id === activeId;
        const done = step.done && !active;
        return (
          <div key={step.id} className="flex items-center min-w-0">
            {index > 0 ? (
              <span
                className={cn(
                  "hidden sm:block w-6 lg:w-10 h-0.5 mx-1 shrink-0 rounded-full",
                  done || active ? "bg-[#E95F2A]/40" : "bg-[#E2E8F0]"
                )}
                aria-hidden
              />
            ) : null}
            <div
              className={cn(
                "flex items-center gap-3 rounded-full px-1 py-1 sm:px-2 transition-colors",
                active && "bg-[#FFF3EC]/80 ring-1 ring-[#E95F2A]/20 pr-4 sm:pr-5"
              )}
              aria-current={active ? "step" : undefined}
            >
              <span
                className={cn(
                  "flex size-9 sm:size-10 shrink-0 items-center justify-center rounded-full text-sm font-bold transition-colors",
                  done || active
                    ? "bg-[#E95F2A] text-white shadow-[0_4px_12px_rgba(233,95,42,0.35)]"
                    : "bg-[#E2E8F0] text-[#64748B]"
                )}
              >
                {done ? <Check className="size-4" strokeWidth={3} aria-hidden /> : index + 1}
              </span>
              <span
                className={cn(
                  "text-[15px] sm:text-base font-semibold truncate",
                  active ? "text-[#0F2A4D]" : done ? "text-[#334155]" : "text-[#94A3B8]"
                )}
              >
                {step.label}
              </span>
            </div>
          </div>
        );
      })}
    </nav>
  );
}
