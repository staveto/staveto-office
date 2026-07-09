import { describe, expect, it } from "vitest";
import type { TaskDoc } from "@/lib/projects";
import { getPhaseDateRangeFromTasks } from "@/lib/projectPlanningDates";

function task(partial: Partial<TaskDoc> & Pick<TaskDoc, "id">): TaskDoc {
  return {
    projectId: "p1",
    title: "Task",
    status: "OPEN",
    ...partial,
  } as TaskDoc;
}

describe("getPhaseDateRangeFromTasks", () => {
  it("uses earliest plannedStart and latest plannedEnd", () => {
    const range = getPhaseDateRangeFromTasks([
      task({ id: "t1", plannedStart: "2026-07-09", plannedEnd: "2026-07-10" }),
      task({ id: "t2", plannedStart: "2026-07-12", plannedEnd: "2026-07-18" }),
    ]);
    expect(range).toEqual({ start: "2026-07-09", end: "2026-07-18" });
  });

  it("updates phase end when child plannedEnd is extended", () => {
    const base = task({
      id: "t1",
      title: "Montáž",
      plannedStart: "2026-07-09",
      dueDate: "2026-07-09",
    });
    expect(getPhaseDateRangeFromTasks([base])).toEqual({
      start: "2026-07-09",
      end: "2026-07-09",
    });

    const extended = {
      ...base,
      plannedEnd: "2026-07-18",
      dueDate: "2026-07-18",
    };
    expect(getPhaseDateRangeFromTasks([extended])).toEqual({
      start: "2026-07-09",
      end: "2026-07-18",
    });
  });

  it("treats missing plannedEnd as one-day task end", () => {
    const range = getPhaseDateRangeFromTasks([
      task({ id: "t1", plannedStart: "2026-07-09" }),
      task({ id: "t2", plannedStart: "2026-07-11", plannedEnd: "2026-07-14" }),
    ]);
    expect(range).toEqual({ start: "2026-07-09", end: "2026-07-14" });
  });

  it("ignores unscheduled tasks", () => {
    const range = getPhaseDateRangeFromTasks([
      task({ id: "t1", plannedStart: "2026-07-09", plannedEnd: "2026-07-12" }),
      task({ id: "t2", title: "No dates" }),
    ]);
    expect(range).toEqual({ start: "2026-07-09", end: "2026-07-12" });
  });

  it("returns null when no planned tasks exist", () => {
    expect(getPhaseDateRangeFromTasks([task({ id: "t1" })])).toBeNull();
    expect(getPhaseDateRangeFromTasks([])).toBeNull();
  });
});
