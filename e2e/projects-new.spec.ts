import { expect, test } from "@playwright/test";
import {
  advanceAiWizardToReviewPlaceholder,
  advanceManualWizardToConcept,
  advanceSimplifiedWizardReadyToCreate,
  advanceSimplifiedWizardToInfo,
  hasE2eCredentials,
  loginWithEnvCredentials,
  useGermanLocale,
} from "./helpers/wizard";

const simplifiedDefault =
  process.env.NEXT_PUBLIC_ENABLE_SIMPLIFIED_PROJECT_CREATION !== "0";
const aiCreationOn = process.env.NEXT_PUBLIC_ENABLE_AI_PROJECT_CREATION === "1";

test.describe("projects/new — unauthenticated", () => {
  test("redirects to login", async ({ page }) => {
    await page.goto("/app/projects/new");
    await expect(page).toHaveURL(/\/login\?next=/);
  });
});

test.describe("projects/new — simplified (default)", () => {
  test.beforeEach(async ({ page }) => {
    test.skip(!hasE2eCredentials(), "E2E_EMAIL and E2E_PASSWORD are required.");
    test.skip(!simplifiedDefault, "Simplified creation is disabled in this environment.");
    await useGermanLocale(page);
    await loginWithEnvCredentials(page);
  });

  test("shows two-step customer → info flow without type or AI method", async ({ page }) => {
    await page.goto("/app/projects/new");
    await expect(page.getByTestId("step-customer")).toBeVisible();
    await expect(page.getByTestId("step-work-type")).toHaveCount(0);
    await expect(page.getByTestId("step-method")).toHaveCount(0);
    await expect(page.getByText(/Mit AI erstellen|Create with AI|pomocou AI/i)).toHaveCount(0);

    await page.getByRole("radio", { name: /ohne Kontakt|without contact|bez kontaktu|Später|later/i }).click();
    await page.getByRole("button", { name: /Weiter|Continue|Pokrač/i }).click();
    await expect(page.getByTestId("step-info")).toBeVisible();
    await expect(page.getByRole("button", { name: /Projekt erstellen|Create project|Vytvoriť projekt/i })).toBeVisible();
  });

  test("copy secondary action is available", async ({ page }) => {
    await page.goto("/app/projects/new");
    await expect(page.getByTestId("copy-existing-project")).toBeVisible();
  });

  test("can reach create with name filled", async ({ page }) => {
    await advanceSimplifiedWizardReadyToCreate(page);
    await expect(page.locator("#name")).toHaveValue(/E2E Simplified/);
    await expect(page.getByRole("button", { name: /Projekt erstellen|Create project|Vytvoriť projekt/i })).toBeEnabled();
  });
});

test.describe("projects/new — legacy wizard (rollback)", () => {
  test.beforeEach(async ({ page }) => {
    test.skip(!hasE2eCredentials(), "E2E_EMAIL and E2E_PASSWORD are required.");
    test.skip(simplifiedDefault, "Legacy wizard E2E runs only when simplified is OFF.");
    await useGermanLocale(page);
    await loginWithEnvCredentials(page);
  });

  test("manual branch reaches concept step", async ({ page }) => {
    await advanceManualWizardToConcept(page);
    await expect(page.getByRole("heading", { level: 2, name: /Fast geschafft|Almost|Takmer/i })).toBeVisible();
  });
});

test.describe("projects/new — legacy AI (opt-in)", () => {
  test.beforeEach(async ({ page }) => {
    test.skip(!hasE2eCredentials(), "E2E_EMAIL and E2E_PASSWORD are required.");
    test.skip(simplifiedDefault || !aiCreationOn, "AI creation E2E needs simplified OFF and AI creation ON.");
    await useGermanLocale(page);
    await loginWithEnvCredentials(page);
  });

  test("ai branch shows review workspace or placeholder after generate", async ({ page }) => {
    await advanceAiWizardToReviewPlaceholder(page);

    const workspace = page.getByTestId("ai-review-workspace");
    const placeholder = page.getByRole("button", { name: /Manuell fortfahren|manual|Manuálne/i });

    await expect(workspace.or(placeholder)).toBeVisible({ timeout: 5_000 });
  });
});

// Keep helper import used for future expansion / lint.
void advanceSimplifiedWizardToInfo;
