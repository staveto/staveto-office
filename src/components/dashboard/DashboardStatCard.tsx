"use client";

import type { LucideIcon } from "lucide-react";
import { Loader2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { useI18n } from "@/i18n/I18nContext";

type DashboardStatCardProps = {
  title: string;
  value: string | number | null;
  icon: LucideIcon;
  loading?: boolean;
  comingSoon?: boolean;
  comingSoonLabel?: string;
};

export function DashboardStatCard({
  title,
  value,
  icon: Icon,
  loading = false,
  comingSoon = false,
  comingSoonLabel,
}: DashboardStatCardProps) {
  const { t } = useI18n();
  const soonLabel = comingSoonLabel ?? t("dashboard.comingSoon");
  const displayValue =
    loading ? null : comingSoon || value === null ? "—" : value;

  return (
    <Card className="bg-white shadow-sm">
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">
          {title}
        </CardTitle>
        <Icon className="size-4 shrink-0 text-[#1D376A]/70" aria-hidden />
      </CardHeader>
      <CardContent>
        <div className="flex items-baseline gap-2">
          {loading ? (
            <Loader2
              className="size-6 animate-spin text-muted-foreground"
              aria-label={t("i18n.aria.loading")}
            />
          ) : (
            <p
              className={cn(
                "text-2xl font-bold tabular-nums",
                displayValue === "—" && "text-muted-foreground"
              )}
            >
              {displayValue}
            </p>
          )}
          {comingSoon && !loading ? (
            <Badge variant="secondary" className="text-[0.65rem]">
              {soonLabel}
            </Badge>
          ) : null}
        </div>
      </CardContent>
    </Card>
  );
}
