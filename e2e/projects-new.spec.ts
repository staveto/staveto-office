import { expect, test } from "@playwright/test";
import {
  advanceAiWizardToReviewPlaceholder,
  advanceManualWizardToConcept,
  hasE2eCredentials,
  loginWithEnvCredentials,
  useGermanLocale,
} from "./helpers/wizard";

test.describe("projects/new — unauthenticated", () => {
  test("redirects to login", async ({ page }) => {
    await page.goto("/app/projects/new");
    await expect(page).toHaveURL(/\/login\?next=/);
  });
});

test.describe("projects/new — authenticated", () => {
  test.beforeEach(async ({ page }) => {
    test.skip(!hasE2eCredentials(), "E2E_EMAIL and E2E_PASSWORD are required.");
    await useGermanLocale(page);
    await loginWithEnvCredentials(page);
  });

  test("manual branch reaches concept step", async ({ page }) => {
    await advanceManualWizardToConcept(page);
    await expect(page.getByRole("heading", { level: 2, name: /Fast geschafft/i })).toBeVisible();
    await expect(page.getByRole("button", { name: /Auftragskonzept erstellen/i })).toBeVisible();
  });

  test("ai branch shows review workspace or placeholder after generate", async ({ page }) => {
    await advanceAiWizardToReviewPlaceholder(page);

    const workspace = page.getByTestId("ai-review-workspace");
    const placeholder = page.getByRole("button", { name: /Manuell fortfahren/i });

    await expect(workspace.or(placeholder)).toBeVisible({ timeout: 5_000 });

    if (await workspace.isVisible()) {
      await expect(page.getByTestId("ai-plan-panel")).toBeVisible();
      await expect(page.getByTestId("ai-assistant-panel")).toBeVisible();
      await expect(page.getByTestId("ai-tab-tasks")).toBeVisible();
      await expect(page.getByTestId("ai-tab-overview")).toBeVisible();
      await expect(page.getByTestId("ai-tab-materials")).toBeVisible();
    } else {
      await expect(placeholder).toBeVisible();
    }
  });

  test("ai review workspace supports selection and assistant panel", async ({ page }) => {
    await advanceAiWizardToReviewPlaceholder(page);

    const workspace = page.getByTestId("ai-review-workspace");
    test.skip(!(await workspace.isVisible()), "AI draft generation did not succeed in this environment.");

    await page.getByTestId("ai-tab-tasks").click();
    await page.getByRole("button", { name: /Phase 1/i }).first().click();
    await expect(page.getByTestId("ai-assistant-panel")).toContainText(/Ausgewählte Phase/i);
    await expect(page.locator("#ai-assistant-request")).toBeEnabled();
  });
});
