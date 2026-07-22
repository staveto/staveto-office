import { brandSearchAliases } from "./brands";
import { normalizeCatalogName } from "./normalizeName";

const SYNONYMS: Record<string, string[]> = {
  vypinac: ["vypinac", "spinac", "switch"],
  zasuvka: ["zasuvka", "zasuvky", "socket"],
  istic: ["istic", "istice", "mcb", "breaker"],
  chranic: ["chranic", "rcd", "fi"],
  svorka: ["svorka", "svorky", "terminal", "wago"],
  rozvodnica: ["rozvodnica", "rozvodnice", "rozvadzac"],
  kabel: ["kabel", "kable", "vodic", "cyky"],
  ramcek: ["ramcek", "ramceky", "kryt"],
  bleskozvod: ["bleskozvod", "uzemnenie", "zachytavac"],
};

export function buildElectricalSearchTokens(input: {
  name: string;
  supplierSku: string;
  brand: string | null;
  series: string | null;
  categoryPathNames: string[];
  productType: string | null;
}): string[] {
  const bag = new Set<string>();

  const addText = (value: string | null | undefined) => {
    if (!value?.trim()) return;
    const n = normalizeCatalogName(value);
    if (!n) return;
    bag.add(n);
    for (const part of n.split(" ")) {
      if (part.length >= 2) bag.add(part);
    }
  };

  addText(input.name);
  addText(input.supplierSku);
  addText(input.brand);
  addText(input.series);
  addText(input.productType);
  for (const c of input.categoryPathNames) addText(c);
  for (const a of brandSearchAliases(input.brand)) addText(a);

  const joined = normalizeCatalogName(
    [input.name, ...input.categoryPathNames, input.productType ?? ""].join(" ")
  );
  for (const [key, aliases] of Object.entries(SYNONYMS)) {
    if (joined.includes(key) || aliases.some((a) => joined.includes(a))) {
      for (const a of aliases) bag.add(a);
    }
  }

  return [...bag].sort();
}
