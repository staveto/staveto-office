import { describe, expect, it } from "vitest";
import { validateElectricalEstimateCompleteness } from "./electricalQualityGate";
import { buildCableStrategy } from "./electricalCableStrategy";
import { composeElectricalCustomerQuote } from "./composeElectricalCustomerQuote";
import { validateQuoteClarity } from "./validateQuoteClarity";
import type { InternalTakeoffRow } from "./electricalQuoteTypes";
import { matchStarterSymbol } from "./electricalSymbolLibrary";

function row(partial: Partial<InternalTakeoffRow> & Pick<InternalTakeoffRow, "id" | "title" | "category">): InternalTakeoffRow {
  return {
    unit: "ks",
    source: "symbol_occurrence",
    confidence: "medium",
    needsReview: false,
    included: true,
    ...partial,
  };
}

describe("electricalQualityGate", () => {
  it("flags missing sockets when document text mentions EL.zásuvka", () => {
    const findings = validateElectricalEstimateCompleteness({
      takeoff: [
        row({ id: "1", title: "Visiace svietidlo", category: "lighting", quantity: 4 }),
      ],
      documentTextHints: ["EL.zásuvka", "el.zásuvka pod sebou"],
    });
    const sockets = findings.find((f) => f.category === "sockets");
    expect(sockets?.status).toBe("missing");
    expect(sockets?.blocksFixedQuote).toBe(true);
  });

  it("flags missing switches when lighting is present", () => {
    const findings = validateElectricalEstimateCompleteness({
      takeoff: [
        row({ id: "1", title: "Stropné svietidlo", category: "lighting", quantity: 6 }),
      ],
    });
    const sw = findings.find((f) => f.category === "switches");
    expect(sw?.status).toBe("missing");
  });
});

describe("electricalCableStrategy", () => {
  it("does not invent cable lengths", () => {
    const res = buildCableStrategy({
      takeoff: [row({ id: "1", title: "Zásuvka", category: "socket", quantity: 10 })],
    });
    expect(res.rows.every((r) => r.needsReview || r.quantity == null)).toBe(true);
    expect(res.rows.some((r) => /zamerať|zamera/i.test(r.title))).toBe(true);
  });
});

describe("composeElectricalCustomerQuote", () => {
  it("groups LED by type not as raw flat customer dump", () => {
    const quote = composeElectricalCustomerQuote({
      takeoff: [
        row({
          id: "a",
          title: "LED pás",
          category: "led_strip",
          quantity: 2,
          unit: "m",
          roomName: "Kuchyňa",
        }),
        row({
          id: "b",
          title: "LED pás",
          category: "led_strip",
          quantity: 3,
          unit: "m",
          roomName: "Obývačka",
        }),
        row({ id: "c", title: "Zásuvka", category: "socket", quantity: 8 }),
      ],
      language: "sk",
      materialPricesKnown: false,
    });
    const led = quote.sections.find((s) => s.id === "led");
    expect(led).toBeTruthy();
    expect(led!.lines.some((l) => l.title === "LED pás" && l.quantity === 5)).toBe(true);
    expect(quote.intro).not.toMatch(/from_document|Electrical marking/i);
    expect(["draft", "preliminary"]).toContain(quote.status);
    expect(quote.warnings.some((w) => /predbežn|cen/i.test(w) || /blocked|Chýbaj/i.test(w))).toBe(true);
  });

  it("does not use raw takeoff as the only customer surface", () => {
    const quote = composeElectricalCustomerQuote({
      takeoff: [
        row({ id: "1", title: "Zásuvka", category: "socket", quantity: 4 }),
        row({ id: "2", title: "Vypínač", category: "switch", quantity: 3 }),
      ],
      language: "sk",
    });
    expect(quote.sections.length).toBeGreaterThan(1);
    expect(quote.sections.some((s) => s.id === "testing")).toBe(true);
    expect(quote.sections.some((s) => s.id === "wall_chasing" || s.id === "cabling")).toBe(true);
  });
});

describe("validateQuoteClarity", () => {
  it("warns on material total 0 and English fragments in SK quote", () => {
    const quote = composeElectricalCustomerQuote({
      takeoff: [row({ id: "1", title: "Zásuvka", category: "socket", quantity: 2 })],
      language: "sk",
      materialPricesKnown: false,
    });
    quote.intro = "Electrical marking drawing Includes legend";
    const res = validateQuoteClarity({
      quote,
      language: "sk",
      materialTotal: 0,
      laborIsGenericOnly: true,
      hasCableStrategy: false,
      rawCustomerRowCount: 46,
    });
    expect(res.ok).toBe(false);
    expect(res.errors.some((e) => /0 €|materiál/i.test(e))).toBe(true);
    expect(res.errors.some((e) => /anglick/i.test(e))).toBe(true);
  });
});

describe("electricalSymbolLibrary", () => {
  it("matches starter aliases for sockets and switches", () => {
    expect(matchStarterSymbol("EL.zásuvka pod sebou")?.normalizedType).toBe("socket");
    expect(matchStarterSymbol("vypínač schodišťový")?.normalizedType).toBe("switch");
    expect(matchStarterSymbol("LED pás v SDK")?.normalizedType).toBe("led_strip");
  });
});
