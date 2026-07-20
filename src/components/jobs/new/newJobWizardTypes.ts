export type ContactMode = "existing" | "new" | "none";

/** Primary creation paths in the new-job wizard (mobile-aligned). */
export type CreationMethod = "manual" | "ai" | "copy";

export type WizardStep =
  | "type"
  | "contact"
  | "method"
  | "manual-details"
  | "copy-source"
  | "copy-options"
  | "copy-details"
  | "ai-brief"
  | "ai-review"
  | "concept";

export type BuildWizardPathOptions = {
  /** Phase 1A simplified flow: customer → info (or copy sub-path). */
  simplified?: boolean;
  /** When false, AI steps are never part of the path. */
  aiCreationEnabled?: boolean;
};

export function buildWizardPath(
  method: CreationMethod | null,
  opts?: BuildWizardPathOptions
): WizardStep[] {
  if (opts?.simplified) {
    if (method === "copy") {
      return ["contact", "copy-source", "copy-options", "copy-details"];
    }
    // Default manual path — no type/method/AI/concept steps.
    return ["contact", "manual-details"];
  }

  const base: WizardStep[] = ["type", "contact", "method"];
  if (method === "ai") {
    if (opts?.aiCreationEnabled === false) {
      return [...base, "manual-details", "concept"];
    }
    return [...base, "ai-brief", "ai-review"];
  }
  if (method === "manual") return [...base, "manual-details", "concept"];
  if (method === "copy") return [...base, "copy-source", "copy-options", "copy-details", "concept"];
  return base;
}

export function getNextStep(
  current: WizardStep,
  method: CreationMethod | null,
  opts?: BuildWizardPathOptions
): WizardStep | null {
  const path = buildWizardPath(method, opts);
  const idx = path.indexOf(current);
  if (idx < 0 || idx >= path.length - 1) return null;
  return path[idx + 1] ?? null;
}

export function getPrevStep(
  current: WizardStep,
  method: CreationMethod | null,
  opts?: BuildWizardPathOptions
): WizardStep | null {
  const path = buildWizardPath(method, opts);
  const idx = path.indexOf(current);
  if (idx <= 0) return null;
  return path[idx - 1] ?? null;
}
