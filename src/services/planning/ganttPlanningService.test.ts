import { describe, expect, it } from "vitest";
import type { ProjectDoc, TaskDoc } from "@/lib/projects";
import { buildGanttHierarchy } from "@/lib/ganttTimeline";
import { applyTaskSchedulePatchToGanttData } from "@/services/planning/ganttPlanningService";
import type { GanttPlanningData } from "@/services/planning/ganttPlanningService";
import type { ProjectPhaseRecord } from "@/services/projects/taskPlanningTypes";

function task(partial: Partial<TaskDoc> & Pick<TaskDoc, "id" | "title">): TaskDoc {
  return {
    projectId: "p1",
    status: "OPEN",
    phaseId: "ph1",
    ...partial,
  } as TaskDoc;
}

const project: ProjectDoc = {
  id: "p1",
  name: "Bungalov",
} as ProjectDoc;

const phases: ProjectPhaseRecord[] = [
  { id: "ph1", name: "Základy", order: 1 },
];

function baseData(tasks: TaskDoc[]): GanttPlanningData {
  const hierarchy = buildGanttHierarchy({
    projects: [project],
    phasesByProject: new Map([["p1", phases]]),
    tasksByProject: new Map([["p1", tasks]]),
  });
  return {
    ...hierarchy,
    canEdit: true,
    tasksByProject: { p1: tasks },
    phasesByProject: { p1: phases },
    projectList: [project],
    teamMembers: [],
  };
}

describe("buildGanttHierarchy aggregate ranges", () => {
  it("derives project range from child task plannedEnd values", () => {
    const tasks = [
      task({
        id: "t1",
        title: "Betonáž",
        plannedStart: "2026-07-09",
        plannedEnd: "2026-07-11",
        dueDate: "2026-07-11",
      }),
      task({
        id: "t2",
        title: "Montáž",
        plannedStart: "2026-07-12",
        plannedEnd: "2026-07-18",
        dueDate: "2026-07-18",
      }),
    ];
    const { projects } = buildGanttHierarchy({
      projects: [project],
      phasesByProject: new Map([["p1", phases]]),
      tasksByProject: new Map([["p1", tasks]]),
    });

    expect(projects[0]?.startYmd).toBe("2026-07-09");
    expect(projects[0]?.endYmd).toBe("2026-07-18");
    expect(projects[0]?.phases[0]?.startYmd).toBe("2026-07-09");
    expect(projects[0]?.phases[0]?.endYmd).toBe("2026-07-18");
  });
});

describe("applyTaskSchedulePatchToGanttData", () => {
  it("rebuilds phase and project bars when a child task is extended", () => {
    const tasks = [
      task({
        id: "t1",
        title: "Montáž",
        plannedStart: "2026-07-09",
        dueDate: "2026-07-09",
      }),
    ];
    const data = baseData(tasks);
    expect(data.projects[0]?.phases[0]?.endYmd).toBe("2026-07-09");

    const next = applyTaskSchedulePatchToGanttData(data, "p1", "t1", {
      plannedStart: "2026-07-09",
      plannedEnd: "2026-07-22",
      dueDate: "2026-07-22",
    });

    expect(next.projects[0]?.phases[0]?.endYmd).toBe("2026-07-22");
    expect(next.projects[0]?.endYmd).toBe("2026-07-22");
    expect(next.tasksByProject.p1?.[0]?.plannedEnd).toBe("2026-07-22");
  });
});
