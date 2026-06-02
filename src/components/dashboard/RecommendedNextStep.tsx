import Link from "next/link";
import { Lightbulb, ArrowRight } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type RecommendedNextStepProps = {
  message: string;
  ctaLabel: string;
  ctaHref: string;
};

export function RecommendedNextStep({
  message,
  ctaLabel,
  ctaHref,
}: RecommendedNextStepProps) {
  return (
    <Card className="border border-[#1D376A]/15 bg-[#1D376A]/[0.03] shadow-sm">
      <CardContent className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex gap-3">
          <Lightbulb className="size-5 shrink-0 text-[#e06737]" aria-hidden />
          <p className="text-sm text-muted-foreground leading-relaxed">{message}</p>
        </div>
        <Link
          href={ctaHref}
          className={cn(
            buttonVariants({ variant: "outline", size: "sm" }),
            "shrink-0 border-[#1D376A]/20"
          )}
        >
          {ctaLabel}
          <ArrowRight className="size-3.5" data-icon="inline-end" />
        </Link>
      </CardContent>
    </Card>
  );
}
