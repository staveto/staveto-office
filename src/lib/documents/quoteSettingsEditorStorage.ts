/**
 * Quote settings editor — local persistence for panel width and test-print template.
 * No Firestore writes; test print uses sessionStorage only.
 */
import {
  DEFAULT_QUOTE_TEMPLATE,
  normalizeQuoteTemplate,
  type QuoteDocumentTemplate,
} from "./quoteTemplateContract";

export const QUOTE_SETTINGS_PANEL_WIDTH_KEY = "staveto.quoteSettings.editorPanelWidth";
export const QUOTE_SETTINGS_TEST_PRINT_TEMPLATE_KEY = "staveto.quoteSettings.testPrintTemplate";
export const QUOTE_SETTINGS_TEST_PRINT_PATH = "/app/settings/quotes/print-preview";

export const DEFAULT_EDITOR_PANEL_WIDTH = 420;
export const MIN_EDITOR_PANEL_WIDTH = 320;
export const MAX_EDITOR_PANEL_WIDTH = 640;

export type QuotePreviewZoom = "fit" | "75" | "100";

export const A4_PREVIEW_WIDTH_PX = 794;

export function clampEditorPanelWidth(width: number): number {
  if (!Number.isFinite(width)) return DEFAULT_EDITOR_PANEL_WIDTH;
  return Math.round(Math.min(MAX_EDITOR_PANEL_WIDTH, Math.max(MIN_EDITOR_PANEL_WIDTH, width)));
}

export function readEditorPanelWidth(storage?: Pick<Storage, "getItem"> | null): number {
  try {
    const raw = storage?.getItem(QUOTE_SETTINGS_PANEL_WIDTH_KEY);
    if (!raw) return DEFAULT_EDITOR_PANEL_WIDTH;
    return clampEditorPanelWidth(Number.parseInt(raw, 10));
  } catch {
    return DEFAULT_EDITOR_PANEL_WIDTH;
  }
}

export function writeEditorPanelWidth(
  width: number,
  storage?: Pick<Storage, "setItem"> | null
): void {
  try {
    storage?.setItem(QUOTE_SETTINGS_PANEL_WIDTH_KEY, String(clampEditorPanelWidth(width)));
  } catch {
    /* ignore quota / private mode */
  }
}

export function quoteTemplateSnapshot(template: QuoteDocumentTemplate): string {
  return JSON.stringify(normalizeQuoteTemplate(template));
}

export function quoteTemplatesEqual(
  a: QuoteDocumentTemplate,
  b: QuoteDocumentTemplate
): boolean {
  return quoteTemplateSnapshot(a) === quoteTemplateSnapshot(b);
}

export function writeQuoteSettingsTestPrintTemplate(
  template: QuoteDocumentTemplate,
  storage?: Pick<Storage, "setItem"> | null
): void {
  try {
    storage?.setItem(
      QUOTE_SETTINGS_TEST_PRINT_TEMPLATE_KEY,
      quoteTemplateSnapshot(template)
    );
  } catch {
    /* ignore */
  }
}

export function readQuoteSettingsTestPrintTemplate(
  storage?: Pick<Storage, "getItem"> | null
): QuoteDocumentTemplate {
  try {
    const raw = storage?.getItem(QUOTE_SETTINGS_TEST_PRINT_TEMPLATE_KEY);
    if (!raw) return { ...DEFAULT_QUOTE_TEMPLATE };
    const parsed = JSON.parse(raw) as unknown;
    return normalizeQuoteTemplate(parsed);
  } catch {
    return { ...DEFAULT_QUOTE_TEMPLATE };
  }
}

/** Opens test print tab — sessionStorage only, no Firestore or quote writes. */
export function openQuoteSettingsTestPrint(
  template: QuoteDocumentTemplate,
  storage?: Pick<Storage, "setItem"> | null,
  openWindow?: (url: string) => Window | null
): void {
  writeQuoteSettingsTestPrintTemplate(template, storage);
  const opener = openWindow ?? ((url: string) => window.open(url, "_blank", "noopener,noreferrer"));
  opener(QUOTE_SETTINGS_TEST_PRINT_PATH);
}

export function resolvePreviewScale(
  zoom: QuotePreviewZoom,
  viewportWidthPx: number,
  paddingPx = 32
): number {
  if (zoom === "75") return 0.75;
  if (zoom === "100") return 1;
  const available = Math.max(200, viewportWidthPx - paddingPx);
  return Math.min(1, available / A4_PREVIEW_WIDTH_PX);
}
