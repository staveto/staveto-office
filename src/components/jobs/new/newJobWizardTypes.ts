export type ContactMode = "existing" | "new" | "none";
export type CreationMethod = "manual" | "ai" | "copy";

export type WizardStep = "type" | "contact" | "method" | "concept";

export const WIZARD_STEPS: WizardStep[] = ["type", "contact", "method", "concept"];
