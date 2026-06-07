"use client";

import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Loader2, ChevronLeft, ChevronRight } from "lucide-react";
import { OnboardingProgress } from "./OnboardingProgress";
import { cn } from "@/lib/utils";

type OnboardingStepShellProps = {
  step: number;
  totalSteps: number;
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  onBack?: () => void;
  backLabel?: string;
  onNext: () => void;
  nextLabel: string;
  canProceed: boolean;
  saving?: boolean;
  showBack?: boolean;
};

export function OnboardingStepShell({
  step,
  totalSteps,
  title,
  subtitle,
  children,
  onBack,
  backLabel = "Back",
  onNext,
  nextLabel,
  canProceed,
  saving = false,
  showBack = true,
}: OnboardingStepShellProps) {
  return (
    <Card className="w-full overflow-hidden rounded-2xl border-0 bg-white shadow-[0_24px_64px_rgba(0,0,0,0.28)] ring-1 ring-white/10">
      <div className="h-1 bg-gradient-to-r from-[#1D376A] via-[#e06737] to-[#e06737]/70" aria-hidden />
      <CardHeader className="space-y-4 pb-2 pt-6">
        <OnboardingProgress current={step} total={totalSteps} />
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-[#1D376A]/60">
            {step} / {totalSteps}
          </p>
          <CardTitle className="mt-1 font-serif text-2xl font-bold text-[#1D376A]">{title}</CardTitle>
          {subtitle ? (
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{subtitle}</p>
          ) : null}
        </div>
      </CardHeader>
      <CardContent className="space-y-4 px-6 pb-2">{children}</CardContent>
      <CardFooter className="flex justify-between gap-3 border-t border-border/60 bg-muted/20 px-6 py-4">
        {showBack && onBack ? (
          <Button type="button" variant="ghost" onClick={onBack} disabled={saving} className="text-[#1D376A]">
            <ChevronLeft className="size-4 mr-1" />
            {backLabel}
          </Button>
        ) : (
          <span />
        )}
        <Button
          type="button"
          onClick={onNext}
          disabled={!canProceed || saving}
          className={cn(
            "min-w-[130px] rounded-xl font-semibold shadow-md transition-all",
            canProceed && !saving
              ? "bg-[#e06737] hover:bg-[#c8562d] hover:shadow-lg"
              : "bg-[#e06737]/40"
          )}
        >
          {saving ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <>
              {nextLabel}
              <ChevronRight className="size-4 ml-1" />
            </>
          )}
        </Button>
      </CardFooter>
    </Card>
  );
}
