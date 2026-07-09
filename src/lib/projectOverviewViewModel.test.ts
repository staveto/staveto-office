import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ProjectDoc, TaskDoc } from "@/lib/projects";
import type { ProjectPhaseRecord } from "@/services/projects/taskPlanningTypes";
import { computeProjectHealth } from "@/lib/projectHealth";
import { computeProjectPhaseMetrics } from "@/lib/projectPhaseMetrics";
import { buildProjectOverviewViewModel } from "@/lib/projectOverviewViewModel";

const TODAY = "2026-07-09";

function project(partial: Partial<ProjectDoc> = {}): ProjectDoc {
  return {
    id: "p1",
    name: "Test project",
    status: "ACTIVE",
    ...partial,
  } as ProjectDoc;
}

function task(partial: Partial<TaskDoc> & { id: string; title: string }): TaskDoc {
  return {
    projectId: "p1",
    status: "OPEN",
    isActive: true,
    ...partial,
  };
}

function phase(partial: Partial<ProjectPhaseRecord> & { id: string; name: string }): ProjectPhaseRecord {
  return {
    projectId: "p1",
    order: 0,
    ...partial,
  } as ProjectPhaseRecord;
}

function buildVm(tasks: TaskDoc[], phases: ProjectPhaseRecord[] = []) {
  const phaseMetrics = computeProjectPhaseMetrics(phases, tasks);
  const health = computeProjectHealth({
    project: project(),
    tasks,
    phaseMetrics,
    assignedCrewCount: 1,
  });
  const phaseLabels = new Map(phases.map((p) => [p.id, p.name]));
  return buildProjectOverviewViewModel({
    project: project(),
    tasks,
    phaseMetrics,
    members: [{ userId: "u1", name: "Ján", email: "jan@test.sk" }],
    timeEntries: [],
    documents: [],
    activeTimers: new Map(),
    health,
    phaseLabels,
  });
}

describe("buildProjectOverviewViewModel todayFocus", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(`${TODAY}T12:00:00`));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("flags urgent issues and counts overdue tasks", () => {
    const vm = buildVm([
      task({ id: "t1", title: "Late A", dueDate: "2026-07-01" }),
      task({ id: "t2", title: "Late B", plannedStart: "2026-07-05" }),
      task({ id: "t3", title: "On time", dueDate: "2026-07-15" }),
    ]);

    expect(vm.todayFocus.hasUrgentIssues).toBe(true);
    expect(vm.todayFocus.overdueCount).toBe(2);
    expect(vm.todayFocus.criticalTask?.id).toBe("t1");
  });

  it("shows next planned task when nothing is urgent", () => {
    const vm = buildVm([
      task({
        id: "t1",
        title: "Soon",
        dueDate: "2026-07-12",
        assigneeId: "u1",
        assignedToolIds: ["tool1"],
      }),
      task({
        id: "t2",
        title: "Later",
        dueDate: "2026-07-20",
        assigneeId: "u1",
        assignedToolIds: ["tool1"],
      }),
    ]);

    expect(vm.todayFocus.hasUrgentIssues).toBe(false);
    expect(vm.todayFocus.overdueCount).toBe(0);
    expect(vm.todayFocus.nextPlannedTask?.id).toBe("t1");
    expect(vm.todayFocus.criticalTask).toBeUndefined();
  });

  it("limits overview lists to three items", () => {
    const phases = [phase({ id: "ph1", name: "Príprava", order: 0 })];
    const tasks = [
      ...Array.from({ length: 5 }, (_, i) =>
        task({
          id: `t${i}`,
          title: `Task ${i}`,
          phaseId: "ph1",
          dueDate: `2026-07-${10 + i}`,
        })
      ),
    ];
    const docs = Array.from({ length: 5 }, (_, i) => ({
      id: `d${i}`,
      projectId: "p1",
      fileName: `photo-${i}.jpg`,
      mimeType: "image/jpeg",
      storagePath: `projects/p1/${i}.jpg`,
    }));

    const phaseMetrics = computeProjectPhaseMetrics(phases, tasks);
    const health = computeProjectHealth({
      project: project(),
      tasks,
      phaseMetrics,
      assignedCrewCount: 1,
    });

    const vm = buildProjectOverviewViewModel({
      project: project(),
      tasks,
      phaseMetrics,
      members: [],
      timeEntries: [],
      documents: docs,
      activeTimers: new Map(),
      health,
      phaseLabels: new Map([["ph1", "Príprava"]]),
    });

    expect(vm.activePhaseTasks).toHaveLength(3);
    expect(vm.photos.recent).toHaveLength(3);
    expect(vm.activity.length).toBeLessThanOrEqual(3);
  });

  it("includes overdue count per phase", () => {
    const phases = [
      phase({ id: "ph1", name: "Príprava", order: 0 }),
      phase({ id: "ph2", name: "Základy", order: 1 }),
    ];
    const tasks = [
      task({ id: "t1", title: "Late", phaseId: "ph1", dueDate: "2026-07-01" }),
      task({ id: "t2", title: "OK", phaseId: "ph2", dueDate: "2026-07-20" }),
    ];

    const vm = buildVm(tasks, phases);
    const prep = vm.phases.find((p) => p.id === "ph1");
    const foundations = vm.phases.find((p) => p.id === "ph2");

    expect(prep?.overdueCount).toBe(1);
    expect(foundations?.overdueCount).toBe(0);
  });
});
