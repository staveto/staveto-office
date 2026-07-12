/**
 * Symbol source priority architecture for technical drawings.
 *
 * Priority:
 * 1. Project legend
 * 2. User-confirmed company mapping
 * 3. Company custom library
 * 4. Licensed country/trade pack
 * 5. International standard reference (metadata only)
 * 6. AI visual guess
 * 7. Unknown → needsReview
 *
 * Licensing: do NOT embed official IEC/ISO glyph drawings unless licensed.
 * IEC 60617 / ISO 14617 are referenced as metadata only.
 */

export type SymbolSourceType =
  | "project_legend"
  | "company_custom"
  | "licensed_standard_pack"
  | "standard_reference_metadata"
  | "ai_inferred"
  | "user_confirmed";

export type SymbolNormalizedType =
  | "socket"
  | "double_socket"
  | "switch"
  | "dimmer"
  | "pendant_light"
  | "ceiling_light"
  | "wall_light"
  | "led_strip"
  | "led_profile"
  | "mirror_light_output"
  | "furniture_light_output"
  | "distribution_board"
  | "data_socket"
  | "cable_route"
  | "unknown";

export type SymbolQuoteGroup =
  | "sockets_switches"
  | "lighting"
  | "led"
  | "cabling"
  | "distribution_board"
  | "testing"
  | "review_only";

export type SymbolLicenseStatus =
  | "internal_sample"
  | "metadata_only"
  | "licensed"
  | "company_defined";

export type SymbolLibraryEntry = {
  id: string;
  trade: "electrical" | "plumbing" | "hvac" | "general";
  countries: string[];
  sourceType: SymbolSourceType;
  standardRef?: string;
  displayName: string;
  aliases: string[];
  normalizedType: SymbolNormalizedType;
  defaultUnit: "ks" | "m" | "bod" | "set" | "unknown";
  quoteGroup: SymbolQuoteGroup;
  licenseStatus: SymbolLicenseStatus;
};

/** Metadata-only standard references (no copyrighted glyphs in repo). */
export const ELECTRICAL_STANDARD_REFS = [
  {
    id: "iec_60617",
    name: "IEC 60617",
    note: "Electrotechnical graphical symbols (database / licensed packs).",
    licenseStatus: "metadata_only" as const,
  },
  {
    id: "iso_14617",
    name: "ISO 14617",
    note: "Graphical symbols for diagrams (reference metadata only).",
    licenseStatus: "metadata_only" as const,
  },
] as const;

export const SYMBOL_SOURCE_PRIORITY: SymbolSourceType[] = [
  "project_legend",
  "user_confirmed",
  "company_custom",
  "licensed_standard_pack",
  "standard_reference_metadata",
  "ai_inferred",
];

/** Safe starter electrical profile — text aliases only, no official drawings. */
export const ELECTRICAL_STARTER_SYMBOL_PROFILE: SymbolLibraryEntry[] = [
  {
    id: "sk_socket",
    trade: "electrical",
    countries: ["SK", "CZ", "AT", "DE"],
    sourceType: "standard_reference_metadata",
    standardRef: "IEC 60617 (architectural installation plans — metadata)",
    displayName: "Zásuvka",
    aliases: [
      "EL.zásuvka",
      "el.zásuvka",
      "zásuvka",
      "zasuvka",
      "el.zásuvka pod sebou",
      "dvojzásuvka",
      "2zásuvka",
      "Steckdose",
      "socket",
      "schuko",
    ],
    normalizedType: "socket",
    defaultUnit: "ks",
    quoteGroup: "sockets_switches",
    licenseStatus: "internal_sample",
  },
  {
    id: "sk_double_socket",
    trade: "electrical",
    countries: ["SK", "CZ"],
    sourceType: "standard_reference_metadata",
    displayName: "Dvojzásuvka",
    aliases: ["dvojzásuvka", "2zásuvka", "el.2zásuvka", "double socket"],
    normalizedType: "double_socket",
    defaultUnit: "ks",
    quoteGroup: "sockets_switches",
    licenseStatus: "internal_sample",
  },
  {
    id: "sk_data_socket",
    trade: "electrical",
    countries: ["SK", "CZ", "DE"],
    sourceType: "standard_reference_metadata",
    displayName: "Dátová zásuvka",
    aliases: ["dátová zásuvka", "datova zasuvka", "UTP", "slaboprúd", "data socket"],
    normalizedType: "data_socket",
    defaultUnit: "ks",
    quoteGroup: "sockets_switches",
    licenseStatus: "internal_sample",
  },
  {
    id: "sk_switch",
    trade: "electrical",
    countries: ["SK", "CZ", "AT", "DE"],
    sourceType: "standard_reference_metadata",
    displayName: "Vypínač",
    aliases: ["vypínač", "vypinac", "spínač", "spinac", "Schalter", "switch"],
    normalizedType: "switch",
    defaultUnit: "ks",
    quoteGroup: "sockets_switches",
    licenseStatus: "internal_sample",
  },
  {
    id: "sk_dimmer",
    trade: "electrical",
    countries: ["SK", "CZ", "DE"],
    sourceType: "standard_reference_metadata",
    displayName: "Stmievač",
    aliases: ["stmievač", "stmievac", "dimmer"],
    normalizedType: "dimmer",
    defaultUnit: "ks",
    quoteGroup: "sockets_switches",
    licenseStatus: "internal_sample",
  },
  {
    id: "sk_pendant",
    trade: "electrical",
    countries: ["SK", "CZ", "DE"],
    sourceType: "standard_reference_metadata",
    displayName: "Visiace svietidlo",
    aliases: ["visiace svietidlo", "závesné", "pendant"],
    normalizedType: "pendant_light",
    defaultUnit: "ks",
    quoteGroup: "lighting",
    licenseStatus: "internal_sample",
  },
  {
    id: "sk_ceiling",
    trade: "electrical",
    countries: ["SK", "CZ", "DE"],
    sourceType: "standard_reference_metadata",
    displayName: "Stropné svietidlo",
    aliases: ["stropné svietidlo", "stropne svietidlo", "ceiling light"],
    normalizedType: "ceiling_light",
    defaultUnit: "ks",
    quoteGroup: "lighting",
    licenseStatus: "internal_sample",
  },
  {
    id: "sk_wall_light",
    trade: "electrical",
    countries: ["SK", "CZ", "DE"],
    sourceType: "standard_reference_metadata",
    displayName: "Nástenné osvetlenie",
    aliases: ["nástenné osvetlenie", "nastenne osvetlenie", "wall light"],
    normalizedType: "wall_light",
    defaultUnit: "ks",
    quoteGroup: "lighting",
    licenseStatus: "internal_sample",
  },
  {
    id: "sk_led_strip",
    trade: "electrical",
    countries: ["SK", "CZ", "DE"],
    sourceType: "standard_reference_metadata",
    displayName: "LED pás",
    aliases: ["LED pás", "LED pas", "LED pás v SDK", "LED strip"],
    normalizedType: "led_strip",
    defaultUnit: "m",
    quoteGroup: "led",
    licenseStatus: "internal_sample",
  },
  {
    id: "sk_led_profile",
    trade: "electrical",
    countries: ["SK", "CZ", "DE"],
    sourceType: "standard_reference_metadata",
    displayName: "LED profil / svetelná lišta",
    aliases: [
      "LED profil",
      "svetelná lišta",
      "svetelna lista",
      "LED pás v svetelnej lište",
      "svietidlá v lište",
    ],
    normalizedType: "led_profile",
    defaultUnit: "m",
    quoteGroup: "led",
    licenseStatus: "internal_sample",
  },
  {
    id: "sk_mirror",
    trade: "electrical",
    countries: ["SK", "CZ"],
    sourceType: "standard_reference_metadata",
    displayName: "Vývod / podsvietenie zrkadla",
    aliases: ["podsvietenie zrkadla", "vývod pre zrkadlo", "mirror light"],
    normalizedType: "mirror_light_output",
    defaultUnit: "ks",
    quoteGroup: "lighting",
    licenseStatus: "internal_sample",
  },
  {
    id: "sk_furniture",
    trade: "electrical",
    countries: ["SK", "CZ"],
    sourceType: "standard_reference_metadata",
    displayName: "Podsvietenie nábytku",
    aliases: [
      "podsvietenie nábytku",
      "podsvietenie vitrína",
      "vývod pre nábytok",
      "furniture light",
    ],
    normalizedType: "furniture_light_output",
    defaultUnit: "ks",
    quoteGroup: "lighting",
    licenseStatus: "internal_sample",
  },
  {
    id: "sk_db",
    trade: "electrical",
    countries: ["SK", "CZ", "DE"],
    sourceType: "standard_reference_metadata",
    displayName: "Rozvádzač",
    aliases: ["rozvádzač", "rozvadzac", "RZ", "hlavný rozvádzač", "distribution board"],
    normalizedType: "distribution_board",
    defaultUnit: "ks",
    quoteGroup: "distribution_board",
    licenseStatus: "internal_sample",
  },
  {
    id: "sk_cable",
    trade: "electrical",
    countries: ["SK", "CZ", "DE"],
    sourceType: "standard_reference_metadata",
    displayName: "Kabeláž / káblová trasa",
    aliases: ["kábel", "kabel", "CYKY", "NYM", "dátový kábel", "UTP", "slaboprúd", "cable"],
    normalizedType: "cable_route",
    defaultUnit: "m",
    quoteGroup: "cabling",
    licenseStatus: "internal_sample",
  },
];

export function matchStarterSymbol(text: string): SymbolLibraryEntry | null {
  const hay = text.trim().toLowerCase();
  if (!hay) return null;
  for (const entry of ELECTRICAL_STARTER_SYMBOL_PROFILE) {
    if (entry.aliases.some((a) => hay.includes(a.toLowerCase()))) return entry;
  }
  return null;
}

export function mapNormalizedToLegacyType(
  t: SymbolNormalizedType
): string {
  switch (t) {
    case "double_socket":
    case "data_socket":
      return "socket";
    case "dimmer":
      return "switch";
    case "led_profile":
      return "lighting_profile";
    case "mirror_light_output":
      return "mirror_light_output";
    case "furniture_light_output":
      return "furniture_light";
    default:
      return t;
  }
}
