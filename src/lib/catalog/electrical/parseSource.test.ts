import { describe, expect, it } from "vitest";
import { parseNestedTree } from "./parseSource";

describe("parseNestedTree", () => {
  it("dedupes by kod and keeps deepest category as primary", () => {
    const parsed = parseNestedTree([
      {
        nazov: "Káble",
        produkty: [
          {
            nazov: "CYKY shallow",
            kod: "ABC1",
            cena_s_dph: "1,20",
            cena_bez_dph: "1,00",
            sklad_ks: "3",
            obrazok_url: "https://www.buco.sk/img/a.jpg",
            url: "https://www.buco.sk/cyky-abc1",
          },
        ],
        podkategorie: [
          {
            nazov: "Inštalačné",
            produkty: [
              {
                nazov: "CYKY deep",
                kod: "ABC1",
                cena_s_dph: "1,20",
                cena_bez_dph: "1,00",
                sklad_ks: "3",
                url: "https://www.buco.sk/cyky-abc1",
              },
            ],
          },
        ],
      },
      {
        nazov: "Ostatné",
        produkty: [
          {
            nazov: "CYKY elsewhere",
            kod: "ABC1",
            url: "https://www.buco.sk/cyky-abc1-alt",
          },
        ],
      },
    ]);

    expect(parsed.format).toBe("nested_tree");
    expect(parsed.products).toHaveLength(1);
    const p = parsed.products[0]!;
    expect(p.kod).toBe("ABC1");
    expect(p.sourceCategoryPath).toBe("Káble › Inštalačné");
    expect(p.sourceCategoryPaths).toEqual([
      "Káble › Inštalačné",
      "Káble",
      "Ostatné",
    ]);
    expect(p.obrazok_url).toContain("a.jpg");
    expect(p.sklad).toBe("3");
  });
});
