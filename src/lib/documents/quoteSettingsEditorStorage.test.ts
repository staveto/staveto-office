import { describe, expect, it } from "vitest";
import {
  A4_PREVIEW_WIDTH_PX,
  clampEditorPanelWidth,
  DEFAULT_EDITOR_PANEL_WIDTH,
  MAX_EDITOR_PANEL_WIDTH,
  MIN_EDITOR_PANEL_WIDTH,
  openQuoteSettingsTestPrint,
  QUOTE_SETTINGS_TEST_PRINT_TEMPLATE_KEY,
  readEditorPanelWidth,
  readQuoteSettingsTestPrintTemplate,
  resolvePreviewScale,
  writeEditorPanelWidth,
  writeQuoteSettingsTestPrintTemplate,
  quoteTemplateSnapshot,
} from "./quoteSettingsEditorStorage";
import { DEFAULT_QUOTE_TEMPLATE, normalizeQuoteTemplate } from "./quoteTemplateContract";
import { SAMPLE_QUOTE } from "./quoteTemplateSampleData";

class MemoryStorage {
  private map = new Map<string, string>();
  getItem(key: string): string | null {
    return this.map.get(key) ?? null;
  }
  setItem(key: string, value: string): void {
    this.map.set(key, value);
  }
}

describe("quoteSettingsEditorStorage", () => {
  it("clamps editor panel width", () => {
    expect(clampEditorPanelWidth(200)).toBe(MIN_EDITOR_PANEL_WIDTH);
    expect(clampEditorPanelWidth(900)).toBe(MAX_EDITOR_PANEL_WIDTH);
    expect(clampEditorPanelWidth(420)).toBe(420);
  });

  it("reads and writes panel width in localStorage adapter", () => {
    const storage = new MemoryStorage();
    expect(readEditorPanelWidth(storage)).toBe(DEFAULT_EDITOR_PANEL_WIDTH);
    writeEditorPanelWidth(500, storage);
    expect(readEditorPanelWidth(storage)).toBe(500);
  });

  it("returns DEFAULT_QUOTE_TEMPLATE when test print sessionStorage is empty", () => {
    const storage = new MemoryStorage();
    const template = readQuoteSettingsTestPrintTemplate(storage);
    expect(template.type).toBe("quote");
    expect(template.theme.primaryColor).toBe(DEFAULT_QUOTE_TEMPLATE.theme.primaryColor);
  });

  it("round-trips unsaved editor template for test print", () => {
    const storage = new MemoryStorage();
    const edited = normalizeQuoteTemplate({
      ...DEFAULT_QUOTE_TEMPLATE,
      theme: { ...DEFAULT_QUOTE_TEMPLATE.theme, primaryColor: "#112233" },
    });
    writeQuoteSettingsTestPrintTemplate(edited, storage);
    const loaded = readQuoteSettingsTestPrintTemplate(storage);
    expect(loaded.theme.primaryColor).toBe("#112233");
    expect(storage.getItem(QUOTE_SETTINGS_TEST_PRINT_TEMPLATE_KEY)).toBeTruthy();
  });

  it("test print open only writes sessionStorage — no save services", () => {
    const storage = new MemoryStorage();
    let openedUrl = "";
    openQuoteSettingsTestPrint(
      DEFAULT_QUOTE_TEMPLATE,
      storage,
      (url) => {
        openedUrl = url;
        return null;
      }
    );
    expect(openedUrl).toContain("print-preview");
    expect(readQuoteSettingsTestPrintTemplate(storage).type).toBe("quote");
  });

  it("preview zoom does not modify template data", () => {
    const before = quoteTemplateSnapshot(DEFAULT_QUOTE_TEMPLATE);
    resolvePreviewScale("75", 800);
    resolvePreviewScale("fit", 600);
    resolvePreviewScale("100", 1200);
    expect(quoteTemplateSnapshot(DEFAULT_QUOTE_TEMPLATE)).toBe(before);
  });

  it("save template remains separate from test print storage key", () => {
    const storage = new MemoryStorage();
    writeQuoteSettingsTestPrintTemplate(DEFAULT_QUOTE_TEMPLATE, storage);
    expect(storage.getItem(QUOTE_SETTINGS_TEST_PRINT_TEMPLATE_KEY)).toBeTruthy();
    expect(storage.getItem("organizations/default-quote")).toBeNull();
  });

  it("settings editor loads default template shape when org id missing", () => {
    const template = readQuoteSettingsTestPrintTemplate(new MemoryStorage());
    expect(normalizeQuoteTemplate(template).type).toBe("quote");
  });
});

describe("sample quote test print safety", () => {
  it("uses sample quote data only — not a real Firestore quote id", () => {
    expect(SAMPLE_QUOTE.id).toBe("sample-preview");
    expect(SAMPLE_QUOTE.clientName).toContain("Sample");
  });
});
