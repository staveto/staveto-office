/**
 * Quote template settings — load/save UI state (not persisted).
 */
import type { LoadQuoteTemplateResult } from "@/services/documents/quoteTemplateService";

export type QuoteTemplateLoadState =
  | "loading"
  | "missing"
  | "loaded"
  | "permission"
  | "network";

export type QuoteTemplateStatusBadge =
  | "loading"
  | "default_template"
  | "saved"
  | "unsaved_changes"
  | "not_saved"
  | "server_issue";

export function resolveQuoteTemplateLoadState(
  result: Pick<LoadQuoteTemplateResult, "loadState">
): Exclude<QuoteTemplateLoadState, "loading"> {
  return result.loadState;
}

export function resolveQuoteTemplateStatusBadge(opts: {
  loading: boolean;
  loadState: QuoteTemplateLoadState;
  isDirty: boolean;
}): QuoteTemplateStatusBadge {
  if (opts.loading || opts.loadState === "loading") {
    return "loading";
  }
  if (opts.loadState === "permission") {
    return "not_saved";
  }
  if (opts.loadState === "network") {
    return "server_issue";
  }
  if (opts.isDirty) {
    return "unsaved_changes";
  }
  if (opts.loadState === "loaded") {
    return "saved";
  }
  return "default_template";
}

export function resolveQuoteTemplateMessageKind(
  loadState: QuoteTemplateLoadState
): "info" | "warning" | null {
  if (loadState === "missing") return "info";
  if (loadState === "permission" || loadState === "network") return "warning";
  return null;
}

export function resolveQuoteTemplateMessageKey(
  loadState: QuoteTemplateLoadState
): string | null {
  if (loadState === "missing") return "settings.quoteTemplate.loadHintUnsaved";
  if (loadState === "permission") return "settings.quoteTemplate.loadWarningPermission";
  if (loadState === "network") return "settings.quoteTemplate.loadWarningNetwork";
  return null;
}

export function resolveQuoteTemplateStatusBadgeKey(
  badge: QuoteTemplateStatusBadge
): string {
  switch (badge) {
    case "loading":
      return "settings.quoteTemplate.statusLoading";
    case "default_template":
      return "settings.quoteTemplate.statusDefaultTemplate";
    case "saved":
      return "settings.quoteTemplate.statusSaved";
    case "unsaved_changes":
      return "settings.quoteTemplate.statusUnsaved";
    case "not_saved":
      return "settings.quoteTemplate.statusNotSaved";
    case "server_issue":
      return "settings.quoteTemplate.statusServerIssue";
  }
}
