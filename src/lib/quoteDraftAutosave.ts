/**
 * Pure helpers for draft quote line autosave (Phase 1C).
 * Keeps debounce / in-flight races testable without React.
 */

/** Firestore path for draft quote lines — sole draft source of truth. */
export function projectQuoteItemsCollectionPath(projectId: string): string {
  return `projects/${projectId}/quoteItems`;
}

/** Workspace catalog path — never written by quote item delete/update. */
export function workspaceCatalogItemsCollectionPath(workspaceKey: string): string {
  return `workspaces/${workspaceKey}/catalogItems`;
}

/**
 * After an async save returns, apply parent/local sync only if this write
 * is still the newest in-flight attempt for the row.
 */
export function shouldApplyAutosaveResult(
  writeGeneration: number,
  latestGeneration: number
): boolean {
  return writeGeneration === latestGeneration;
}

/**
 * Next generation token when scheduling a save (monotonic per row).
 */
export function nextAutosaveGeneration(current: number | undefined): number {
  return (current ?? 0) + 1;
}

/**
 * Manual quote editor never calls AI callables.
 * Listed for regression grep / unit assertion of the contract.
 */
export const MANUAL_QUOTE_EDITOR_FORBIDDEN_AI_CALLABLES = [
  "generateProjectDraft",
  "createProjectFromDraft",
  "updateProjectDraftWithAI",
  "improveProjectBrief",
] as const;

/**
 * Draft editor must not create top-level quotes on autosave.
 * Upsert is only allowed from explicit user CTA.
 */
export const MANUAL_QUOTE_AUTOSAVE_FORBIDDEN_OPS = [
  "upsertQuoteFromProject",
  "createQuoteFromProject",
] as const;
