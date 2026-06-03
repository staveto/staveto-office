"use client";

import type { MemberTodayStatus } from "@/services/planning";
import { useI18n } from "@/i18n/I18nContext";
import styles from "./planning.module.css";
import { cn } from "@/lib/utils";

type PlanningStatusBadgeProps = {
  status: MemberTodayStatus;
};

export function PlanningStatusBadge({ status }: PlanningStatusBadgeProps) {
  const { t } = useI18n();

  const className =
    status === "working"
      ? styles.statusWorking
      : status === "absent"
        ? styles.statusAbsent
        : status === "no_record"
          ? styles.statusNoRecord
          : styles.statusUnknown;

  return (
    <span className={cn(styles.statusBadge, className)}>
      {t(`planning.status.${status}`)}
    </span>
  );
}
