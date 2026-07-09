import { describe, expect, it } from "vitest";
import type { GanttPhaseNode, GanttProjectNode } from "@/lib/ganttTimeline";
import {
  applyDurationChange,
  applyQuickShift,
  buildTaskSchedulePatchFromDraft,
  canApplyAggregatedShift,
  countPlannedTasksInPhase,
  countWorkingDaysInclusive,
  derivePhaseDateRange,
  deriveProjectDateRange,
  taskDateDraftFromDoc,
} from "@/lib/planningDateRange";
import type { TaskDoc } from "@/lib/projects";

const project: GanttProjectNode = {
  id: "p1",
  name: "Bungalov",
  phases: [
    {
      id: "ph1",
      projectId: "p1",
      name: "Základy",
      isGeneral: false,
      tasks: [
        {
          id: "t1",
          projectId: "p1",
          title: "Task 1",
          status: "OPEN",
          startYmd: "2026-07-01",
          endYmd: "2026-07-05",
          isUnscheduled: false,
          canResize: true,
          isMilestone: false,
          barStatus: "open",
        },
      ],
      startYmd: "2026-07-01",
      endYmd: "2026-07-05",
      done: 0,
      total: 1,
      open: 1,
      isActive: true,
    },
  ],
  progress: 0,
  totalTasks: 1,
  doneTasks: 0,
};

describe("deriveProjectDateRange", () => {
  it("returns min/max from scheduled tasks", () => {
    expect(deriveProjectDateRange(project)).toEqual({
      startYmd: "2026-07-01",
      endYmd: "2026-07-05",
    });
  });
});

describe("derivePhaseDateRange", () => {
  it("returns phase task bounds", () => {
    const phase = project.phases[0] as GanttPhaseNode;
    expect(derivePhaseDateRange(phase)).toEqual({
      startYmd: "2026-07-01",
      endYmd: "2026-07-05",
    });
  });

  it("updates when a child task end is extended", () => {
    const phase = project.phases[0] as GanttPhaseNode;
    const extended = {
      ...phase,
      tasks: phase.tasks.map((t) =>
        t.id === "t1" ? { ...t, endYmd: "2026-07-18" } : t
      ),
    };
    expect(derivePhaseDateRange(extended)).toEqual({
      startYmd: "2026-07-01",
      endYmd: "2026-07-18",
    });
  });
});

describe("countWorkingDaysInclusive", () => {
  it("counts Mon–Fri within range", () => {
    expect(countWorkingDaysInclusive("2026-07-06", "2026-07-10")).toBe(5);
  });
});

describe("taskDateDraftFromDoc", () => {
  it("builds editable draft from task doc", () => {
    const draft = taskDateDraftFromDoc({
      id: "t1",
      projectId: "p1",
      title: "X",
      plannedStart: "2026-07-01",
      plannedEnd: "2026-07-03",
      dueDate: "2026-07-03",
    } as TaskDoc);
    expect(draft?.plannedStart).toBe("2026-07-01");
    expect(draft?.canResize).toBe(true);
  });

  it("allows one-day tasks to be edited and extended", () => {
    const draft = taskDateDraftFromDoc({
      id: "t2",
      projectId: "p1",
      title: "Montáž",
      plannedStart: "2026-07-09",
      dueDate: "2026-07-09",
    } as TaskDoc);
    expect(draft?.canResize).toBe(true);
    expect(draft?.plannedEnd).toBe("2026-07-09");
  });
});

describe("applyQuickShift", () => {
  it("shifts start and end together", () => {
    const base = taskDateDraftFromDoc({
      id: "t1",
      projectId: "p1",
      title: "X",
      plannedStart: "2026-07-06",
      plannedEnd: "2026-07-10",
      dueDate: "2026-07-10",
    } as TaskDoc)!;
    const shifted = applyQuickShift(base, 1, false);
    expect(shifted.plannedStart).toBe("2026-07-07");
    expect(shifted.plannedEnd).toBe("2026-07-11");
  });
});

describe("applyDurationChange", () => {
  it("extends end date for working days", () => {
    const base = taskDateDraftFromDoc({
      id: "t1",
      projectId: "p1",
      title: "X",
      plannedStart: "2026-07-06",
      plannedEnd: "2026-07-06",
      dueDate: "2026-07-06",
    } as TaskDoc)!;
    const next = applyDurationChange({ ...base, canResize: true }, 3);
    expect(next.plannedEnd).toBe("2026-07-08");
  });
});

describe("buildTaskSchedulePatchFromDraft", () => {
  it("stores null plannedEnd for single-day tasks", () => {
    const draft = taskDateDraftFromDoc({
      id: "t1",
      projectId: "p1",
      title: "Montáž",
      plannedStart: "2026-07-09",
      dueDate: "2026-07-09",
    } as TaskDoc)!;
    expect(buildTaskSchedulePatchFromDraft(draft)).toEqual({
      plannedStart: "2026-07-09",
      plannedEnd: null,
      dueDate: "2026-07-09",
    });
  });

  it("stores plannedEnd for multi-day tasks", () => {
    const draft = taskDateDraftFromDoc({
      id: "t2",
      projectId: "p1",
      title: "Omietky",
      plannedStart: "2026-07-09",
      plannedEnd: "2026-07-12",
      dueDate: "2026-07-12",
    } as TaskDoc)!;
    expect(buildTaskSchedulePatchFromDraft(draft)).toEqual({
      plannedStart: "2026-07-09",
      plannedEnd: "2026-07-12",
      dueDate: "2026-07-12",
    });
  });

  it("keeps manually edited dueDate separate from plannedEnd", () => {
    const draft = taskDateDraftFromDoc({
      id: "t3",
      projectId: "p1",
      title: "Omietky",
      plannedStart: "2026-07-09",
      plannedEnd: "2026-07-12",
      dueDate: "2026-07-15",
    } as TaskDoc)!;
    expect(buildTaskSchedulePatchFromDraft(draft).dueDate).toBe("2026-07-15");
  });
});

describe("canApplyAggregatedShift", () => {
  it("blocks zero-day phase shift until user picks offset", () => {
    expect(canApplyAggregatedShift(0)).toBe(false);
    expect(canApplyAggregatedShift(1)).toBe(true);
    expect(canApplyAggregatedShift(-3)).toBe(true);
  });
});

describe("countPlannedTasksInPhase", () => {
  it("counts only scheduled open tasks in phase", () => {
    const tasks: TaskDoc[] = [
      {
        id: "1",
        projectId: "p1",
        title: "A",
        phaseId: "ph1",
        plannedStart: "2026-07-01",
        status: "OPEN",
      },
      {
        id: "2",
        projectId: "p1",
        title: "B",
        phaseId: "ph1",
        status: "OPEN",
      },
      {
        id: "3",
        projectId: "p1",
        title: "C",
        phaseId: "ph2",
        plannedStart: "2026-07-01",
        status: "OPEN",
      },
    ];
    expect(countPlannedTasksInPhase(tasks, "ph1")).toBe(1);
  });
});
