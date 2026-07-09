import { describe, expect, it } from "vitest";
import type { GanttProjectNode } from "@/lib/ganttTimeline";
import type { TaskDoc } from "@/lib/projects";
import {
  buildPlanningOverviewMetrics,
  buildProjectCardSummaries,
  deriveActivePhaseName,
  deriveProjectRisk,
  projectRiskFromTaskDocs,
  summarizeTaskDocs,
} from "@/lib/planningSummaryMetrics";

const TODAY = "2026-07-09";

function task(partial: Partial<TaskDoc> & { id: string; title: string }): TaskDoc {
  return {
    projectId: "p1",
    status: "OPEN",
    ...partial,
  };
}

function ganttTask(partial: {
  id: string;
  title: string;
  barStatus: "done" | "active" | "open" | "blocked" | "overdue" | "unassigned";
  isUnscheduled?: boolean;
  startYmd?: string;
  endYmd?: string;
  assigneeId?: string;
}) {
  return {
    projectId: "p1",
    status: "OPEN",
    canResize: false,
    ...partial,
  };
}

describe("deriveProjectRisk", () => {
  it("returns blocked when any blocked task exists", () => {
    expect(
      deriveProjectRisk(
        [ganttTask({ id: "1", title: "A", barStatus: "blocked" })],
        TODAY
      )
    ).toBe("blocked");
  });

  it("returns delayed when overdue and not blocked", () => {
    expect(
      deriveProjectRisk(
        [ganttTask({ id: "1", title: "A", barStatus: "overdue" })],
        TODAY
      )
    ).toBe("delayed");
  });

  it("returns risk for unassigned or unscheduled tasks", () => {
    expect(
      deriveProjectRisk(
        [ganttTask({ id: "1", title: "A", barStatus: "unassigned" })],
        TODAY
      )
    ).toBe("risk");
    expect(
      deriveProjectRisk(
        [
          ganttTask({
            id: "2",
            title: "B",
            barStatus: "open",
            isUnscheduled: true,
          }),
        ],
        TODAY
      )
    ).toBe("risk");
  });

  it("returns ok when tasks are planned and assigned", () => {
    expect(
      deriveProjectRisk(
        [
          ganttTask({
            id: "1",
            title: "A",
            barStatus: "open",
            startYmd: "2026-07-10",
            endYmd: "2026-07-12",
            assigneeId: "u1",
          }),
        ],
        TODAY
      )
    ).toBe("ok");
  });
});

describe("summarizeTaskDocs", () => {
  it("counts open, overdue, unassigned and blocked", () => {
    const stats = summarizeTaskDocs(
      [
        task({ id: "1", title: "Done", status: "DONE", assigneeId: "u1", plannedStart: "2026-07-01" }),
        task({ id: "2", title: "Late", assigneeId: "u1", plannedStart: "2026-07-01", dueDate: "2026-07-01" }),
        task({ id: "3", title: "No one", plannedStart: "2026-07-10" }),
        task({ id: "4", title: "Blocked", status: "BLOCKED", assigneeId: "u2", plannedStart: "2026-07-10" }),
      ],
      TODAY
    );
    expect(stats.open).toBe(3);
    expect(stats.overdue).toBe(1);
    expect(stats.unassigned).toBe(1);
    expect(stats.blocked).toBe(1);
  });
});

describe("projectRiskFromTaskDocs", () => {
  it("maps task docs to risk status", () => {
    expect(
      projectRiskFromTaskDocs(
        [task({ id: "1", title: "X", status: "BLOCKED", assigneeId: "a" })],
        TODAY
      )
    ).toBe("blocked");
  });
});

describe("buildProjectCardSummaries", () => {
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
          ganttTask({
            id: "t1",
            title: "Task 1",
            barStatus: "overdue",
            assigneeId: "u1",
            startYmd: "2026-07-01",
            endYmd: "2026-07-02",
          }),
        ],
        startYmd: "2026-07-01",
        endYmd: "2026-07-02",
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

  it("derives card metrics and delayed risk", () => {
    const cards = buildProjectCardSummaries([project], TODAY);
    expect(cards).toHaveLength(1);
    expect(cards[0].openTasks).toBe(1);
    expect(cards[0].overdueTasks).toBe(1);
    expect(cards[0].activePhaseName).toBe("Základy");
    expect(cards[0].risk).toBe("delayed");
    expect(cards[0].workerIds).toEqual(["u1"]);
  });
});

describe("deriveActivePhaseName", () => {
  it("returns active non-general phase name", () => {
    const project: GanttProjectNode = {
      id: "p1",
      name: "P",
      phases: [
        {
          id: "ph1",
          projectId: "p1",
          name: "Hrubá stavba",
          isGeneral: false,
          tasks: [],
          done: 0,
          total: 0,
          open: 0,
          isActive: true,
        },
      ],
      progress: 0,
      totalTasks: 0,
      doneTasks: 0,
    };
    expect(deriveActivePhaseName(project)).toBe("Hrubá stavba");
  });
});

describe("buildPlanningOverviewMetrics", () => {
  it("aggregates totals across projects", () => {
    const projects: GanttProjectNode[] = [
      {
        id: "p1",
        name: "A",
        phases: [
          {
            id: "ph",
            projectId: "p1",
            name: "Phase",
            isGeneral: false,
            tasks: [
              ganttTask({
                id: "t1",
                title: "T",
                barStatus: "open",
                assigneeId: "u1",
                startYmd: TODAY,
                endYmd: TODAY,
              }),
            ],
            done: 0,
            total: 1,
            open: 1,
            isActive: true,
          },
        ],
        progress: 0,
        totalTasks: 1,
        doneTasks: 0,
      },
    ];
    const metrics = buildPlanningOverviewMetrics({
      projects,
      tasksByProject: {
        p1: [
          task({
            id: "t1",
            title: "T",
            assigneeId: "u1",
            plannedStart: TODAY,
            plannedEnd: TODAY,
          }),
        ],
      },
      todayYmd: TODAY,
    });
    expect(metrics.totalActiveProjects).toBe(1);
    expect(metrics.openTasks).toBe(1);
    expect(metrics.openPhases).toBe(1);
    expect(metrics.workersActiveToday).toBe(1);
  });
});
