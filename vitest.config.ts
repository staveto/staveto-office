import path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: [
      "src/lib/workspace/**/*.test.ts",
      "src/lib/market/**/*.test.ts",
      "src/lib/quotes/**/*.test.ts",
      "src/lib/documents/**/*.test.ts",
      "src/lib/agent/**/*.test.ts",
      "src/lib/enabledWorkTypes.test.ts",
      "src/lib/planningSummaryMetrics.test.ts",
      "src/lib/planningDateRange.test.ts",
      "src/lib/ganttTimeline.test.ts",
      "src/lib/projectPlanningDates.test.ts",
      "src/lib/ganttBarDisplay.test.ts",
      "src/lib/projectOverviewViewModel.test.ts",
      "src/services/planning/ganttPlanningService.test.ts",
      "src/lib/ai/**/*.test.ts",
      "src/lib/products/**/*.test.ts",
      "src/services/estimatorKnowledge/**/*.test.ts",
      "src/lib/takeoff/**/*.test.ts",
      "src/services/takeoff/**/*.test.ts",
      "src/services/projects/**/*.test.ts",
    ],
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
});
