"use client";

import { CheckCircle2, Circle } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { useI18n } from "@/i18n/I18nContext";
import type { ProjectDoc } from "@/lib/projects";

const STEPS = [
  { id: "request", anchor: undefined },
  { id: "photos", anchor: undefined },
  { id: "materials", anchor: "quote-items" },
  { id: "quote", anchor: "quote-items" },
  { id: "delivery", anchor: undefined },
] as const;

type DraftJobNextStepsProps = {
  project: ProjectDoc;
  className?: string;
};

export function DraftJobNextSteps({ project, className }: DraftJobNextStepsProps) {
  const { t } = useI18n();

  const done = {
    request: !!project.customerRequest?.trim(),
    photos: false,
    materials: false,
    quote: project.quoteStatus !== "none" && !!project.quoteStatus,
    delivery: false,
  };

  return (
    <Card className={cn("border-[#1D376A]/15 bg-[#1D376A]/[0.03]", className)}>
      <CardHeader className="pb-2">
        <CardTitle className="text-base text-[#1D376A]">
          {t("projects.new.nextSteps.title")}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <ul className="space-y-2.5" role="list">
          {STEPS.map((step) => {
            const isDone = done[step.id];
            const content = (
              <>
                {isDone ? (
                  <CheckCircle2 className="size-4 shrink-0 text-[#e06737]" aria-hidden />
                ) : (
                  <Circle className="size-4 shrink-0 text-muted-foreground/60" aria-hidden />
                )}
                <span className={cn("text-sm", isDone && "text-muted-foreground")}>
                  {t(`projects.new.nextSteps.${step.id}`)}
                </span>
              </>
            );
            return (
              <li key={step.id}>
                {step.anchor ? (
                  <a
                    href={`#${step.anchor}`}
                    className="flex items-center gap-2 rounded-md py-0.5 hover:text-[#e06737] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#e06737]/50"
                  >
                    {content}
                  </a>
                ) : (
                  <span className="flex items-center gap-2 py-0.5">{content}</span>
                )}
              </li>
            );
          })}
        </ul>
        <p className="mt-3 text-xs text-muted-foreground">{t("projects.new.nextSteps.hint")}</p>
      </CardContent>
    </Card>
  );
}
