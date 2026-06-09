export type AiRefineNodeTarget =
  | { kind: "phase"; phaseId: string; phaseIndex: number; title: string; description?: string }
  | {
      kind: "task";
      phaseId: string;
      taskId: string;
      phaseIndex: number;
      taskIndex: number;
      title: string;
      description?: string;
    };
