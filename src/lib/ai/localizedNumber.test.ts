import { describe, expect, it } from "vitest";
import {
  parseAreaM2FromText,
  parseLocalizedNumber,
  roundDocumentQuantity,
} from "./localizedNumber";

describe("parseLocalizedNumber", () => {
  it("parses Slovak decimal comma", () => {
    expect(parseLocalizedNumber("12,5")).toBe(12.5);
    expect(parseLocalizedNumber("12,50")).toBe(12.5);
    expect(parseLocalizedNumber("0,75")).toBe(0.75);
  });

  it("parses European thousands with comma decimal", () => {
    expect(parseLocalizedNumber("1.234,56")).toBe(1234.56);
    expect(parseLocalizedNumber("12.345,6")).toBe(12345.6);
  });

  it("parses US thousands with dot decimal", () => {
    expect(parseLocalizedNumber("1,234.56")).toBe(1234.56);
    expect(parseLocalizedNumber("12.5")).toBe(12.5);
  });

  it("parses spaced thousands", () => {
    expect(parseLocalizedNumber("1 234,5")).toBe(1234.5);
  });

  it("strips area units", () => {
    expect(parseLocalizedNumber("24,3 m²")).toBe(24.3);
    expect(parseLocalizedNumber("86.5 m2")).toBe(86.5);
  });

  it("passes through valid numbers", () => {
    expect(parseLocalizedNumber(24.3)).toBe(24.3);
  });

  it("does not treat 12,500 as decimal when three fraction digits", () => {
    expect(parseLocalizedNumber("12,500")).toBe(12500);
  });
});

describe("parseAreaM2FromText", () => {
  it("extracts area from Slovak labels", () => {
    expect(parseAreaM2FromText("Plocha: 24,3 m²")).toBe(24.3);
    expect(parseAreaM2FromText("celkom 1.234,56 m2")).toBe(1234.56);
  });
});

describe("roundDocumentQuantity", () => {
  it("rounds to two decimals", () => {
    expect(roundDocumentQuantity(12.3456)).toBe(12.35);
  });
});
