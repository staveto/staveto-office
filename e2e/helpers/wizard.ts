import type { Page } from "@playwright/test";

export function hasE2eCredentials(): boolean {
  return Boolean(process.env.E2E_EMAIL && process.env.E2E_PASSWORD);
}

export async function useGermanLocale(page: Page): Promise<void> {
  await page.addInitScript(() => {
    localStorage.setItem("staveto.locale", "de");
  });
}

export async function loginWithEnvCredentials(page: Page): Promise<void> {
  const email = process.env.E2E_EMAIL;
  const password = process.env.E2E_PASSWORD;
  if (!email || !password) {
    throw new Error("Set E2E_EMAIL and E2E_PASSWORD to run authenticated E2E tests.");
  }

  await page.goto("/login");
  await page.locator("#email").fill(email);
  await page.locator("#password").fill(password);
  await page.locator("form button[type='submit']").click();
  await page.waitForURL(/\/app/, { timeout: 45_000 });
}

export async function clickContinue(page: Page): Promise<void> {
  await page.getByRole("button", { name: /Weiter|Continue|Pokrač/i }).click();
}

/** Phase 1A simplified flow: Customer → Info (no work-type / method). */
export async function advanceSimplifiedWizardToInfo(page: Page): Promise<void> {
  await page.goto("/app/projects/new");
  await page.getByTestId("step-customer").waitFor();
  await page.getByRole("radio", { name: /ohne Kontakt|without contact|bez kontaktu|Später|later|neskôr/i }).click();
  await clickContinue(page);
  await page.getByTestId("step-info").waitFor();
}

export async function advanceSimplifiedWizardReadyToCreate(page: Page): Promise<void> {
  await advanceSimplifiedWizardToInfo(page);
  await page.locator("#name").fill(`E2E Simplified ${Date.now()}`);
}

/** @deprecated Legacy multi-step wizard — only when NEXT_PUBLIC_ENABLE_SIMPLIFIED_PROJECT_CREATION=0 */
export async function advanceToMethodStep(page: Page): Promise<void> {
  await page.goto("/app/projects/new");
  await page.getByRole("radio", { name: /Service/i }).first().click();
  await clickContinue(page);
  await page.getByRole("radio", { name: /Später ergänzen|without contact|bez kontaktu/i }).click();
  await clickContinue(page);
}

/** @deprecated Legacy — requires simplified OFF + AI creation ON */
export async function advanceManualWizardToConcept(page: Page): Promise<void> {
  await advanceToMethodStep(page);
  await page.getByRole("radio", { name: /Manuell erstellen|Create manually|manuálne/i }).click();
  await clickContinue(page);
  await page.locator("#name").fill(`E2E Manual ${Date.now()}`);
  await clickContinue(page);
  await page.getByRole("heading", { level: 2, name: /Fast geschafft|Almost|Takmer/i }).waitFor();
}

/** @deprecated Legacy AI wizard — requires NEXT_PUBLIC_ENABLE_AI_PROJECT_CREATION=1 and simplified OFF */
export async function advanceAiWizardToReviewPlaceholder(page: Page): Promise<void> {
  await advanceToMethodStep(page);
  await page.getByRole("radio", { name: /Mit AI erstellen|Create with AI|pomocou AI/i }).click();
  await clickContinue(page);
  await page.locator("#ai-project-name").fill(`E2E AI ${Date.now()}`);
  await page.locator("#ai-project-brief").fill(
    "Wärmepumpe installieren: Besichtigung, Montage, Inbetriebnahme und Übergabe an Kunden."
  );
  await clickContinue(page);
  await page
    .getByTestId("ai-review-workspace")
    .or(page.getByRole("button", { name: /Manuell fortfahren|manual|Manuálne/i }))
    .or(page.getByText(/AI-Entwurf konnte nicht|AI draft|AI návrh/i))
    .first()
    .waitFor({ timeout: 120_000 });
}
