import { describe, expect, it } from "vitest";
import {
  buildProductPriceLookupPrompt,
  extractGroundingUrls,
  parseProductPriceLookupText,
} from "./productPriceLookup";

describe("productPriceLookup", () => {
  it("builds a prompt with product name", () => {
    const prompt = buildProductPriceLookupPrompt({
      productName: "Niloé Vypínač Č.1",
      brand: "Legrand",
    });
    expect(prompt).toContain("Niloé Vypínač Č.1");
    expect(prompt).toContain("Legrand");
    expect(prompt).toContain("found");
  });

  it("parses JSON price from model text", () => {
    const result = parseProductPriceLookupText(
      'Here you go\n{"found":true,"matchedName":"Niloé","unitPrice":4.85,"currency":"EUR","unit":"ks","summary":"BUČO","confidence":"high"}',
      "Niloé Vypínač"
    );
    expect(result.found).toBe(true);
    expect(result.unitPrice).toBe(4.85);
    expect(result.source).toBe("web_search_ai");
    expect(result.indicative).toBe(true);
  });

  it("rejects invented zero / missing prices", () => {
    const result = parseProductPriceLookupText(
      '{"found":true,"unitPrice":0,"currency":"EUR"}',
      "X"
    );
    expect(result.found).toBe(false);
    expect(result.unitPrice).toBeNull();
  });

  it("extracts grounding URLs", () => {
    const urls = extractGroundingUrls({
      candidates: [
        {
          groundingMetadata: {
            groundingChunks: [
              { web: { title: "BUČO", uri: "https://example.com/a" } },
              { web: { title: "Shop", uri: "https://example.com/a" } },
            ],
          },
        },
      ],
    });
    expect(urls).toEqual([{ title: "BUČO", url: "https://example.com/a" }]);
  });
});
