import { afterEach, describe, expect, it, vi } from "vitest";
import {
  catalogUnitToQuoteDraftUnit,
  mergeQuoteDraftDocumentMeta,
  mergeQuoteDraftPlainNotes,
  projectHasQuoteCustomer,
  shouldConfirmQuoteItemDelete,
  shouldShowManualQuoteEditor,
  shouldShowQuoteCustomerHint,
} from "./manualQuoteWorkspace";
import type { ProjectDoc } from "./projects";

function baseProject(overrides: Partial<ProjectDoc> = {}): ProjectDoc {
  return {
    id: "p1",
    name: "Test",
    phase: "sales",
    lifecycleStatus: "new_request",
    salesStatus: "draft",
    quoteStatus: "none",
    jobArchetype: "customer_job",
    workType: "REPAIR",
    ...overrides,
  } as ProjectDoc;
}

describe("manualQuoteWorkspace", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("maps catalog units to quote draft units", () => {
    expect(catalogUnitToQuoteDraftUnit("pcs")).toBe("ks");
    expect(catalogUnitToQuoteDraftUnit("m2")).toBe("m²");
    expect(catalogUnitToQuoteDraftUnit("hour")).toBe("hod");
    expect(catalogUnitToQuoteDraftUnit("m")).toBe("m");
  });

  it("preserves AI JSON when updating plain notes", () => {
    const existing = JSON.stringify({
      aiSetupMeta: { workEstimate: {}, calculation: { vatPercent: 20 } },
      plainNotes: "old",
    });
    const next = mergeQuoteDraftPlainNotes(existing, "new note");
    const parsed = JSON.parse(next) as {
      aiSetupMeta: unknown;
      plainNotes: string;
    };
    expect(parsed.aiSetupMeta).toBeTruthy();
    expect(parsed.plainNotes).toBe("new note");
  });

  it("keeps plain notes as plain string when no AI meta", () => {
    expect(mergeQuoteDraftPlainNotes("hello", "world")).toBe("world");
  });

  it("stores general quote description in document meta", () => {
    const next = mergeQuoteDraftDocumentMeta(null, {
      scopeOfWork: "Kompletná elektroinštalácia bytu",
    });
    const parsed = JSON.parse(next) as {
      quoteDocumentMeta: { scopeOfWork: string };
    };
    expect(parsed.quoteDocumentMeta.scopeOfWork).toBe(
      "Kompletná elektroinštalácia bytu"
    );
  });

  it("preserves plain notes when updating description", () => {
    const existing = JSON.stringify({ plainNotes: "platnosť 30 dní" });
    const next = mergeQuoteDraftDocumentMeta(existing, {
      scopeOfWork: "Výmena rozvádzača",
    });
    const parsed = JSON.parse(next) as {
      plainNotes: string;
      quoteDocumentMeta: { scopeOfWork: string };
    };
    expect(parsed.plainNotes).toBe("platnosť 30 dní");
    expect(parsed.quoteDocumentMeta.scopeOfWork).toBe("Výmena rozvádzača");
  });

  it("detects customer presence", () => {
    expect(projectHasQuoteCustomer({ customerId: "c1" })).toBe(true);
    expect(projectHasQuoteCustomer({ customerName: "Ján" })).toBe(true);
    expect(projectHasQuoteCustomer({})).toBe(false);
  });

  it("asks confirm when qty or price is set", () => {
    expect(shouldConfirmQuoteItemDelete(1, 0)).toBe(true);
    expect(shouldConfirmQuoteItemDelete(0, 10)).toBe(true);
    expect(shouldConfirmQuoteItemDelete(0, 0)).toBe(false);
  });

  it("shows manual editor for sales drafts when flag is on", () => {
    expect(shouldShowManualQuoteEditor(baseProject())).toBe(true);
    vi.stubEnv("NEXT_PUBLIC_ENABLE_MANUAL_QUOTE_WORKSPACE", "0");
    expect(shouldShowManualQuoteEditor(baseProject())).toBe(false);
  });

  it("shows soft customer hint for customer_job without customer", () => {
    expect(shouldShowQuoteCustomerHint(baseProject())).toBe(true);
    expect(
      shouldShowQuoteCustomerHint(baseProject({ customerId: "c1" }))
    ).toBe(false);
  });

  it("allows draft editing without customer (hint only, not a block)", () => {
    const p = baseProject({ customerId: undefined, customerName: undefined });
    expect(projectHasQuoteCustomer(p)).toBe(false);
    expect(shouldShowManualQuoteEditor(p)).toBe(true);
    expect(shouldShowQuoteCustomerHint(p)).toBe(true);
  });

  it("hides manual editor when feature flag rolls back", () => {
    vi.stubEnv("NEXT_PUBLIC_ENABLE_MANUAL_QUOTE_WORKSPACE", "0");
    expect(shouldShowManualQuoteEditor(baseProject())).toBe(false);
    expect(shouldShowQuoteCustomerHint(baseProject())).toBe(false);
  });
});
