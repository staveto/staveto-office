"use client";

import { Badge } from "@/components/ui/badge";
import { useI18n } from "@/i18n/I18nContext";
import type { QuoteStatus } from "@/lib/quotes";

const VARIANT: Record<
  QuoteStatus,
  "default" | "secondary" | "destructive" | "outline"
> = {
  draft: "secondary",
  sent: "outline",
  accepted: "default",
  rejected: "destructive",
};

type QuoteStatusBadgeProps = {
  status: QuoteStatus;
};

export function QuoteStatusBadge({ status }: QuoteStatusBadgeProps) {
  const { t } = useI18n();
  return (
    <Badge variant={VARIANT[status] ?? "secondary"}>
      {t(`quotes.status.${status}`)}
    </Badge>
  );
}
