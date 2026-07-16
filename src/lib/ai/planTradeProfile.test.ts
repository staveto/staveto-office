import { describe, expect, it } from "vitest";
import {
  detectPlanTradeProfile,
  filterCategoriesByProfile,
} from "./planTradeProfile";

describe("detectPlanTradeProfile", () => {
  it("detects Slovak electrical plan from legend texts", () => {
    const profile = detectPlanTradeProfile({
      fileName: "08_Znacenie_elektrika 2.pdf",
      texts: [
        "El.2zásuvka pod sebou",
        "Vypínač radenie 1",
        "Visiace svietidlo",
        "LED pás v SDK",
      ],
    });
    expect(profile.trade).toBe("electrical");
    expect(profile.countryCode).toBe("SK");
    expect(profile.standardHint).toContain("STN");
    expect(profile.allowedCategories).toContain("socket");
    expect(profile.needsUserConfirm).toBe(false);
  });

  it("detects plumbing plan and gives no electrical categories", () => {
    const profile = detectPlanTradeProfile({
      fileName: "zdravotechnika_podorys.pdf",
      texts: ["Vodovod studená voda", "Kanalizácia DN110"],
    });
    expect(profile.trade).toBe("plumbing");
    expect(profile.allowedCategories).toBeNull();
  });

  it("unknown trade requires user confirmation", () => {
    const profile = detectPlanTradeProfile({ fileName: "scan001.pdf", texts: [] });
    expect(profile.trade).toBe("unknown");
    expect(profile.needsUserConfirm).toBe(true);
  });

  it("workspace country wins over detected language", () => {
    const profile = detectPlanTradeProfile({
      fileName: "elektro.pdf",
      texts: ["zásuvka"],
      workspaceCountryCode: "cz",
    });
    expect(profile.countryCode).toBe("CZ");
    expect(profile.standardHint).toContain("ČSN");
  });
});

describe("filterCategoriesByProfile", () => {
  it("keeps only trade categories for electrical", () => {
    const profile = detectPlanTradeProfile({
      fileName: "elektro.pdf",
      texts: ["zásuvka", "vypínač", "svietidlo"],
    });
    expect(
      filterCategoriesByProfile(["socket", "double_socket", "cable"], profile)
    ).toEqual(["socket", "double_socket", "cable"]);
  });

  it("does not filter when trade unknown", () => {
    const profile = detectPlanTradeProfile({ fileName: "x.pdf" });
    expect(filterCategoriesByProfile(["socket", "switch"], profile)).toEqual([
      "socket",
      "switch",
    ]);
  });
});
