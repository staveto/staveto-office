export type ContactMode = "existing" | "new" | "none";

/** Primary creation paths in the new-job wizard (mobile-aligned). */
export type CreationMethod = "manual" | "ai";

export type WizardStep =
  | "type"
  | "contact"
  | "method"
  | "manual-details"
  | "ai-brief"
  | "ai-review"
  | "concept";

export function buildWizardPath(method: CreationMethod | null): WizardStep[] {
  const base: WizardStep[] = ["type", "contact", "method"];
  if (method === "ai") return [...base, "ai-brief", "ai-review"];
  if (method === "manual") return [...base, "manual-details", "concept"];
  return base;
}

export function getNextStep(
  current: WizardStep,
  method: CreationMethod | null
): WizardStep | null {
  const path = buildWizardPath(method);
  const idx = path.indexOf(current);
  if (idx < 0 || idx >= path.length - 1) return null;
  return path[idx + 1] ?? null;
}

export function getPrevStep(
  current: WizardStep,
  method: CreationMethod | null
): WizardStep | null {
  const path = buildWizardPath(method);
  const idx = path.indexOf(current);
  if (idx <= 0) return null;
  return path[idx - 1] ?? null;
}
