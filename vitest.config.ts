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
      "src/lib/projectCreationFeature.test.ts",
      "src/lib/manualQuoteWorkspace.test.ts",
      "src/lib/quoteDraftAutosave.test.ts",
      "src/lib/projectDashboard.quoteHref.test.ts",
      "src/lib/projectDefaultTab.test.ts",
      "src/components/jobs/new/newJobWizardTypes.test.ts",
      "src/lib/planningSummaryMetrics.test.ts",
      "src/lib/planningDateRange.test.ts",
      "src/lib/ganttTimeline.test.ts",
      "src/lib/projectPlanningDates.test.ts",
      "src/lib/ganttBarDisplay.test.ts",
      "src/lib/projectOverviewViewModel.test.ts",
      "src/services/planning/ganttPlanningService.test.ts",
      "src/lib/ai/**/*.test.ts",
      "src/lib/products/**/*.test.ts",
      "src/lib/catalog/**/*.test.ts",
      "src/lib/catalog/electrical/**/*.test.ts",
      "src/services/estimatorKnowledge/**/*.test.ts",
      "src/lib/takeoff/**/*.test.ts",
      "src/services/takeoff/**/*.test.ts",
      "src/services/projects/**/*.test.ts",
      "src/services/materials/**/*.test.ts",
      "src/components/projects/setup/**/*.test.ts",
    ],
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
});
