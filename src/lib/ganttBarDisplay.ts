import { countDaysInclusive } from "@/lib/ganttTimeline";

export const GANTT_BAR_LABEL_FULL_MIN_PX = 120;
export const GANTT_BAR_LABEL_COMPACT_MAX_PX = 60;

export type GanttBarLabelMode = "full" | "hidden" | "compact";

export type GanttBarTooltipData = {
  title: string;
  dateRange?: string;
  durationLabel?: string;
  assignee?: string;
  statusLabel?: string;
  meta?: string;
};

export function getGanttBarLabelMode(barWidthPx: number): GanttBarLabelMode {
  if (barWidthPx >= GANTT_BAR_LABEL_FULL_MIN_PX) return "full";
  if (barWidthPx < GANTT_BAR_LABEL_COMPACT_MAX_PX) return "compact";
  return "hidden";
}

export function shouldShowGanttBarLabel(barWidthPx: number): boolean {
  return getGanttBarLabelMode(barWidthPx) === "full";
}

export function formatGanttDurationLabel(
  startYmd?: string,
  endYmd?: string,
  daysShortLabel = "d"
): string | undefined {
  if (!startYmd) return undefined;
  const end = endYmd ?? startYmd;
  const days = countDaysInclusive(startYmd, end);
  return `${days} ${daysShortLabel}`;
}

export function buildGanttBarTooltipData(input: {
  title: string;
  startYmd?: string;
  endYmd?: string;
  formatRange?: (start?: string, end?: string) => string | undefined;
  daysShortLabel?: string;
  durationTemplate?: (count: number) => string;
  assignee?: string;
  statusLabel?: string;
  equipmentCount?: number;
  equipmentLabel?: (count: number) => string;
}): GanttBarTooltipData {
  const dateRange = input.formatRange?.(input.startYmd, input.endYmd ?? input.startYmd);
  const days =
    input.startYmd != null
      ? countDaysInclusive(input.startYmd, input.endYmd ?? input.startYmd)
      : undefined;
  const durationLabel =
    days != null
      ? input.durationTemplate
        ? input.durationTemplate(days)
        : formatGanttDurationLabel(input.startYmd, input.endYmd, input.daysShortLabel)
      : undefined;

  let meta: string | undefined;
  if (input.equipmentCount != null && input.equipmentCount > 0) {
    meta = input.equipmentLabel
      ? input.equipmentLabel(input.equipmentCount)
      : `${input.equipmentCount}`;
  }

  return {
    title: input.title,
    dateRange,
    durationLabel,
    assignee: input.assignee,
    statusLabel: input.statusLabel,
    meta,
  };
}
