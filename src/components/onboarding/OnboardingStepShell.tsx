"use client";

import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Loader2, ChevronLeft, ChevronRight } from "lucide-react";
import { OnboardingProgress } from "./OnboardingProgress";

const COLORS = {
  primary: "#e06737",
};

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
    <Card className="max-w-lg w-full bg-white/95 shadow-lg">
      <CardHeader className="space-y-3">
        <OnboardingProgress current={step} total={totalSteps} />
        <div>
          <CardTitle className="text-xl">{title}</CardTitle>
          {subtitle ? (
            <p className="mt-1 text-sm text-muted-foreground">{subtitle}</p>
          ) : null}
        </div>
      </CardHeader>
      <CardContent className="space-y-4">{children}</CardContent>
      <CardFooter className="flex justify-between gap-2">
        {showBack && onBack ? (
          <Button type="button" variant="ghost" onClick={onBack} disabled={saving}>
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
          className="min-w-[120px]"
          style={{ backgroundColor: COLORS.primary }}
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
