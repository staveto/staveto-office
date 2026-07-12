import { describe, expect, it } from "vitest";
import {
  buildElectricalCustomerScopeSk,
  looksLikeInternalProjectBrief,
  resolveCustomerScopeOfWork,
  sanitizeCustomerScopeOfWork,
} from "../quoteCustomerScope";

describe("quoteCustomerScope", () => {
  it("detects internal AI / wizard briefs", () => {
    expect(
      looksLikeInternalProjectBrief(
        "Job archetype: customer job for a client | Location: Trnava"
      )
    ).toBe(true);
    expect(
      looksLikeInternalProjectBrief(
        "Electrical marking drawing for a residential project. Includes legend."
      )
    ).toBe(true);
    expect(
      looksLikeInternalProjectBrief(
        "Predmetom ponuky je elektroinštalácia podľa projektovej dokumentácie."
      )
    ).toBe(false);
  });

  it("strips internal paragraphs from mixed scope", () => {
    const mixed = [
      "Electrical marking drawing for a residential project. Includes legend.",
      "Predmetom ponuky je elektroinštalácia v projekte Neopolis.",
      "Job archetype: customer job for a client | Location: Trnava",
    ].join("\n\n");
    const out = sanitizeCustomerScopeOfWork(mixed);
    expect(out).toContain("Neopolis");
    expect(out).not.toMatch(/Electrical marking/i);
    expect(out).not.toMatch(/Job archetype/i);
  });

  it("builds electrical customer scope without internal jargon", () => {
    const scope = buildElectricalCustomerScopeSk({
      detectedDocumentTypes: ["electrical_marking"],
      extractedItems: [{ category: "socket" }, { category: "lighting" }],
    });
    expect(scope).toMatch(/elektroinštalácia/i);
    expect(scope).toMatch(/zásuviek/i);
    expect(scope).not.toMatch(/legend|archetype|from_document/i);
  });

  it("prefers safe noteToCustomer over facts", () => {
    const out = resolveCustomerScopeOfWork({
      noteToCustomer: "Dodávka a montáž elektroinštalácie podľa výkresu.",
      facts: { detectedDocumentTypes: ["electrical_marking"] },
    });
    expect(out).toContain("Dodávka a montáž");
  });

  it("ignores unsafe note and falls back to electrical scope", () => {
    const out = resolveCustomerScopeOfWork({
      noteToCustomer: "Electrical marking drawing. Includes legend.",
      facts: {
        detectedDocumentTypes: ["electrical_marking"],
        extractedItems: [{ category: "switch" }],
      },
    });
    expect(out).toMatch(/elektroinštalácia/i);
    expect(out).not.toMatch(/Electrical marking/i);
  });
});
