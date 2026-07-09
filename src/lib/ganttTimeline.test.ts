import { describe, expect, it } from "vitest";
import type { TaskDoc } from "@/lib/projects";
import {
  computeTaskResizePatch,
  getTaskDateRange,
  isRealMilestone,
  previewTaskResizeRange,
} from "@/lib/ganttTimeline";

function task(partial: Partial<TaskDoc> & Pick<TaskDoc, "id" | "title">): TaskDoc {
  return {
    projectId: "p1",
    status: "OPEN",
    ...partial,
  } as TaskDoc;
}

describe("isRealMilestone", () => {
  it("detects milestone from title patterns", () => {
    expect(isRealMilestone(task({ id: "1", title: "Milestone: foundation check" }))).toBe(true);
    expect(isRealMilestone(task({ id: "2", title: "Milník dokončenia" }))).toBe(true);
    expect(isRealMilestone(task({ id: "3", title: "MS: handover" }))).toBe(true);
  });

  it("detects future milestone flag", () => {
    expect(
      isRealMilestone({ ...task({ id: "4", title: "Delivery" }), milestone: true })
    ).toBe(true);
  });

  it("does not treat normal one-day tasks as milestones", () => {
    expect(isRealMilestone(task({ id: "5", title: "Montáž okien" }))).toBe(false);
    expect(isRealMilestone(task({ id: "6", title: "Betonáž základov" }))).toBe(false);
  });
});

describe("getTaskDateRange", () => {
  it("allows resize for one-day tasks without plannedEnd", () => {
    const range = getTaskDateRange(
      task({
        id: "t1",
        title: "Montáž",
        plannedStart: "2026-07-09",
        dueDate: "2026-07-09",
      })
    );
    expect(range.isUnscheduled).toBe(false);
    expect(range.canResize).toBe(true);
    expect(range.isMilestone).toBe(false);
    expect(range.startYmd).toBe("2026-07-09");
    expect(range.endYmd).toBe("2026-07-09");
  });

  it("allows resize when plannedStart equals plannedEnd", () => {
    const range = getTaskDateRange(
      task({
        id: "t2",
        title: "Omietky",
        plannedStart: "2026-07-09",
        plannedEnd: "2026-07-09",
        dueDate: "2026-07-09",
      })
    );
    expect(range.canResize).toBe(true);
    expect(range.isMilestone).toBe(false);
  });

  it("allows resize for multi-day plannedStart and plannedEnd", () => {
    const range = getTaskDateRange(
      task({
        id: "t4",
        title: "Zateplenie fasády",
        plannedStart: "2026-07-09",
        plannedEnd: "2026-07-15",
        dueDate: "2026-07-15",
      })
    );
    expect(range.canResize).toBe(true);
    expect(range.isMilestone).toBe(false);
    expect(range.startYmd).toBe("2026-07-09");
    expect(range.endYmd).toBe("2026-07-15");
  });

  it("marks real milestones as non-resizable", () => {
    const range = getTaskDateRange(
      task({
        id: "t3",
        title: "Milník: kolaudácia",
        plannedStart: "2026-07-09",
        dueDate: "2026-07-09",
      })
    );
    expect(range.isMilestone).toBe(true);
    expect(range.canResize).toBe(false);
  });
});

describe("gantt bar rendering decision", () => {
  function shouldRenderDiamond(
    title: string,
    startYmd: string,
    endYmd: string = startYmd
  ): boolean {
    const range = getTaskDateRange(
      task({ id: "x", title, plannedStart: startYmd, plannedEnd: endYmd, dueDate: endYmd })
    );
    return range.isMilestone && range.startYmd === range.endYmd;
  }

  it("renders normal one-day tasks as bars, not diamonds", () => {
    expect(shouldRenderDiamond("Montáž okien", "2026-07-09")).toBe(false);
    expect(shouldRenderDiamond("Betonáž", "2026-07-09")).toBe(false);
  });

  it("renders real milestones as diamonds", () => {
    expect(shouldRenderDiamond("Milník: kolaudácia", "2026-07-09")).toBe(true);
  });
});

describe("computeTaskResizePatch", () => {
  const oneDay = task({
    id: "t1",
    title: "Montáž",
    plannedStart: "2026-07-09",
    dueDate: "2026-07-09",
  });

  it("extends plannedEnd when dragging right edge on one-day task", () => {
    expect(computeTaskResizePatch(oneDay, "end", "2026-07-12")).toEqual({
      plannedStart: "2026-07-09",
      plannedEnd: "2026-07-12",
      dueDate: "2026-07-12",
    });
  });

  it("updates plannedStart when dragging left edge", () => {
    const multi = task({
      id: "t2",
      title: "Omietky",
      plannedStart: "2026-07-09",
      plannedEnd: "2026-07-12",
      dueDate: "2026-07-12",
    });
    expect(computeTaskResizePatch(multi, "start", "2026-07-07")).toEqual({
      plannedStart: "2026-07-07",
      plannedEnd: "2026-07-12",
      dueDate: "2026-07-12",
    });
  });

  it("normalizes when left edge passes right edge", () => {
    const multi = task({
      id: "t3",
      title: "Omietky",
      plannedStart: "2026-07-09",
      plannedEnd: "2026-07-12",
      dueDate: "2026-07-12",
    });
    expect(computeTaskResizePatch(multi, "start", "2026-07-20")).toEqual({
      plannedStart: "2026-07-20",
      plannedEnd: null,
      dueDate: "2026-07-20",
    });
  });

  it("extends task with missing plannedEnd", () => {
    const missingEnd = task({
      id: "t4",
      title: "Zateplenie",
      plannedStart: "2026-07-09",
    });
    expect(computeTaskResizePatch(missingEnd, "end", "2026-07-11")).toEqual({
      plannedStart: "2026-07-09",
      plannedEnd: "2026-07-11",
      dueDate: "2026-07-11",
    });
  });

  it("keeps dueDate aligned with plannedEnd on right-edge resize", () => {
    const patch = computeTaskResizePatch(oneDay, "end", "2026-07-11");
    expect(patch.dueDate).toBe(patch.plannedEnd);
  });
});

describe("previewTaskResizeRange", () => {
  it("previews inclusive duration while resizing", () => {
    const preview = previewTaskResizeRange("2026-07-09", "2026-07-09", "end", 3);
    expect(preview).toEqual({ startYmd: "2026-07-09", endYmd: "2026-07-12" });
  });
});

describe("taskDateDraftFromDoc one-day resize", () => {
  it("marks one-day construction tasks as editable", async () => {
    const { taskDateDraftFromDoc } = await import("@/lib/planningDateRange");
    const draft = taskDateDraftFromDoc(
      task({
        id: "t1",
        title: "Montáž",
        plannedStart: "2026-07-09",
        dueDate: "2026-07-09",
      })
    );
    expect(draft?.canResize).toBe(true);
    expect(draft?.plannedEnd).toBe("2026-07-09");
  });
});
