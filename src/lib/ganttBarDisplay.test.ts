import { describe, expect, it } from "vitest";
import {
  buildGanttBarTooltipData,
  getGanttBarLabelMode,
  shouldShowGanttBarLabel,
  GANTT_BAR_LABEL_COMPACT_MAX_PX,
  GANTT_BAR_LABEL_FULL_MIN_PX,
} from "@/lib/ganttBarDisplay";

describe("getGanttBarLabelMode", () => {
  it("shows full label at 120px and above", () => {
    expect(getGanttBarLabelMode(120)).toBe("full");
    expect(getGanttBarLabelMode(200)).toBe("full");
    expect(shouldShowGanttBarLabel(120)).toBe(true);
  });

  it("hides label between 60px and 119px", () => {
    expect(getGanttBarLabelMode(80)).toBe("hidden");
    expect(shouldShowGanttBarLabel(80)).toBe(false);
  });

  it("uses compact mode below 60px", () => {
    expect(getGanttBarLabelMode(40)).toBe("compact");
    expect(getGanttBarLabelMode(GANTT_BAR_LABEL_COMPACT_MAX_PX - 1)).toBe("compact");
    expect(GANTT_BAR_LABEL_FULL_MIN_PX).toBe(120);
  });
});

describe("buildGanttBarTooltipData", () => {
  it("includes duration and range for short bars", () => {
    const tooltip = buildGanttBarTooltipData({
      title: "Montáž okien",
      startYmd: "2026-07-09",
      endYmd: "2026-07-12",
      formatRange: (s, e) => `${s} – ${e}`,
      durationTemplate: (count) => `${count} dní`,
      assignee: "Ján Novák",
      statusLabel: "Otvorená",
      equipmentCount: 2,
      equipmentLabel: (count) => `${count} nástroje`,
    });

    expect(tooltip.title).toBe("Montáž okien");
    expect(tooltip.dateRange).toBe("2026-07-09 – 2026-07-12");
    expect(tooltip.durationLabel).toBe("4 dní");
    expect(tooltip.assignee).toBe("Ján Novák");
    expect(tooltip.statusLabel).toBe("Otvorená");
    expect(tooltip.meta).toBe("2 nástroje");
  });
});
