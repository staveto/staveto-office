"use client";

import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { useI18n } from "@/i18n/I18nContext";

type DashboardQuickActionCardProps = {
  title: string;
  icon: LucideIcon;
  href?: string;
  comingSoon?: boolean;
  comingSoonLabel?: string;
};

export function DashboardQuickActionCard({
  title,
  icon: Icon,
  href,
  comingSoon = false,
  comingSoonLabel,
}: DashboardQuickActionCardProps) {
  const { t } = useI18n();
  const soonLabel = comingSoonLabel ?? t("dashboard.comingSoon");
  const isLink = !comingSoon && !!href;

  const inner = (
    <Card
      className={cn(
        "h-full bg-white shadow-sm transition-colors",
        isLink && "hover:ring-2 hover:ring-primary/30 cursor-pointer",
        comingSoon && "opacity-90"
      )}
    >
      <CardContent className="flex min-h-[5.5rem] flex-col items-start justify-between gap-3 p-4 sm:min-h-[6rem]">
        <div className="flex w-full items-start justify-between gap-2">
          <span
            className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-[#1D376A]/10 text-[#1D376A]"
            aria-hidden
          >
            <Icon className="size-5" />
          </span>
          {comingSoon ? (
            <Badge variant="secondary" className="shrink-0 text-[0.65rem]">
              {soonLabel}
            </Badge>
          ) : null}
        </div>
        <span className="text-sm font-medium leading-snug">{title}</span>
      </CardContent>
    </Card>
  );

  if (isLink && href) {
    return (
      <Link href={href} className="block h-full min-h-[44px] rounded-xl outline-none focus-visible:ring-2 focus-visible:ring-ring">
        {inner}
      </Link>
    );
  }

  return (
    <div className="h-full" aria-disabled={comingSoon}>
      {inner}
    </div>
  );
}
