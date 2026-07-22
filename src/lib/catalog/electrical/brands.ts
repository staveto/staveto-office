import { normalizeCatalogName } from "./normalizeName";

const BRANDS: Array<{ brand: string; patterns: RegExp[] }> = [
  { brand: "Schneider Electric", patterns: [/\bschneider(?:\s+electric)?\b/i, /\bsedna\b/i, /\bunica\b/i, /\basfora\b/i, /\bmerten\b/i] },
  { brand: "Legrand", patterns: [/\blegrand\b/i, /\bvalena\b/i, /\bnilo[eé]\b/i, /\bliving\s*now\b/i, /\bc[eé]liane\b/i, /\bmosaic\b/i, /\boteo\b/i, /\bforix\b/i, /\bplexo\b/i, /\bmureva\b/i] },
  { brand: "Eaton", patterns: [/\beaton\b/i, /\bmoeller\b/i] },
  { brand: "Hager", patterns: [/\bhager\b/i] },
  { brand: "WAGO", patterns: [/\bwago\b/i] },
  { brand: "Finder", patterns: [/\bfinder\b/i] },
  { brand: "Niko", patterns: [/\bniko\b/i] },
  { brand: "Berker", patterns: [/\bberker\b/i] },
  { brand: "OBO Bettermann", patterns: [/\bobo(?:\s+bettermann)?\b/i] },
  { brand: "SCAME", patterns: [/\bscame\b/i] },
  { brand: "ELKO EP", patterns: [/\belko(?:\s*ep)?\b/i] },
  { brand: "Rittal", patterns: [/\brittal\b/i] },
  { brand: "Tehnoplast", patterns: [/\btehnoplast\b/i] },
];

const SERIES: Array<{ series: string; patterns: RegExp[] }> = [
  { series: "Valena Life", patterns: [/\bvalena\s*life\b/i] },
  { series: "Valena", patterns: [/\bvalena\b/i] },
  { series: "Niloé Step", patterns: [/\bnilo[eé]\s*step\b/i] },
  { series: "Niloé", patterns: [/\bnilo[eé]\b/i] },
  { series: "Living Now", patterns: [/\bliving\s*now\b/i] },
  { series: "Céliane", patterns: [/\bc[eé]liane\b/i] },
  { series: "Mosaic", patterns: [/\bmosaic\b/i] },
  { series: "Oteo", patterns: [/\boteo\b/i] },
  { series: "Forix", patterns: [/\bforix\b/i] },
  { series: "Asfora", patterns: [/\basfora\b/i] },
  { series: "Sedna", patterns: [/\bsedna\b/i] },
  { series: "Unica", patterns: [/\bunica\b/i] },
  { series: "Merten System M", patterns: [/\bmerten\s*system\s*m\b/i, /\bsystem\s*m\b/i] },
  { series: "Plexo", patterns: [/\bplexo\b/i] },
  { series: "Mureva", patterns: [/\bmureva\b/i] },
];

export function extractBrand(name: string, url: string): string | null {
  const hay = `${name} ${url}`;
  for (const entry of BRANDS) {
    if (entry.patterns.some((p) => p.test(hay))) return entry.brand;
  }
  return null;
}

export function extractSeries(name: string, url: string): string | null {
  const hay = `${name} ${url}`;
  for (const entry of SERIES) {
    if (entry.patterns.some((p) => p.test(hay))) return entry.series;
  }
  return null;
}

export function brandSearchAliases(brand: string | null): string[] {
  if (!brand) return [];
  const n = normalizeCatalogName(brand);
  const out = [n];
  if (brand === "Schneider Electric") out.push("schneider");
  if (brand === "OBO Bettermann") out.push("obo");
  if (brand === "ELKO EP") out.push("elko");
  return out;
}
