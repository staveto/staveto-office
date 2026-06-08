"use client";

import { Badge } from "@/components/ui/badge";
import { useI18n } from "@/i18n/I18nContext";
import type { ExpenseStatus } from "@/lib/expenses";

const VARIANT: Record<
  ExpenseStatus,
  "default" | "secondary" | "destructive" | "outline"
> = {
  READY: "default",
  PROCESSING: "outline",
  FAILED: "destructive",
};

type ExpenseStatusBadgeProps = {
  status?: ExpenseStatus | string;
};

export function ExpenseStatusBadge({ status }: ExpenseStatusBadgeProps) {
  const { t } = useI18n();
  const normalized: ExpenseStatus =
    status === "PROCESSING" || status === "READY" || status === "FAILED"
      ? status
      : "READY";

  return (
    <Badge variant={VARIANT[normalized] ?? "secondary"}>
      {t(`expenses.status.${normalized}`)}
    </Badge>
  );
}
