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

import type { NormalizedElectricalPoint } from "./electricalAssemblyTemplates";

export type SymbolSourceType =
  | "project_legend"
  | "company_custom"
  | "licensed_standard_pack"
  | "standard_reference_metadata"
  | "ai_inferred"
  | "user_confirmed";

/** Legacy normalized types used by takeoff / Gemini layer. */
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
  countryCodes: string[];
  /** @deprecated use countryCodes — kept for older callers */
  countries: string[];
  sourceType: SymbolSourceType;
  standardRef?: string;
  standardName?: string;
  displayName: string;
  aliases: string[];
  textPatterns: string[];
  normalizedType: SymbolNormalizedType;
  normalizedPoint: NormalizedElectricalPoint;
  defaultUnit: "ks" | "m" | "bod" | "set" | "unknown";
  quoteGroup: SymbolQuoteGroup;
  confidenceWeight: number;
  licenseStatus: SymbolLicenseStatus;
};

export type SymbolPackId =
  | "IEC60617LicensedPack"
  | "STNElectricalLicensedPack"
  | "CompanyCustomSymbolPack"
  | "InternalSampleAliases";

export type SymbolPackDescriptor = {
  id: SymbolPackId;
  name: string;
  trade: "electrical" | "plumbing" | "hvac" | "general";
  countryCodes: string[];
  licenseStatus: SymbolLicenseStatus;
  connected: boolean;
  note: string;
};

export const ELECTRICAL_STANDARD_REFS = [
  {
    id: "iec_60617",
    name: "IEC 60617",
    trade: "electrical" as const,
    countryCodes: ["SK", "CZ", "AT", "DE", "CH", "EU"],
    note: "Electrotechnical graphical symbols (database / licensed packs). No official drawings embedded.",
    licenseStatus: "metadata_only" as const,
  },
  {
    id: "iso_14617",
    name: "ISO 14617",
    trade: "electrical" as const,
    countryCodes: ["SK", "CZ", "AT", "DE", "CH", "EU"],
    note: "Graphical symbols for diagrams (reference metadata only).",
    licenseStatus: "metadata_only" as const,
  },
  {
    id: "stn_electrical_ref",
    name: "STN / national electrical marking practice (SK)",
    trade: "electrical" as const,
    countryCodes: ["SK"],
    note: "National practice reference metadata only — connect licensed STN pack later.",
    licenseStatus: "metadata_only" as const,
  },
] as const;

export const SYMBOL_PACK_SLOTS: SymbolPackDescriptor[] = [
  {
    id: "IEC60617LicensedPack",
    name: "IEC 60617 licensed pack",
    trade: "electrical",
    countryCodes: ["EU"],
    licenseStatus: "licensed",
    connected: false,
    note: "Placeholder — connect only with a valid license; do not ship glyphs without rights.",
  },
  {
    id: "STNElectricalLicensedPack",
    name: "STN electrical licensed pack",
    trade: "electrical",
    countryCodes: ["SK"],
    licenseStatus: "licensed",
    connected: false,
    note: "Placeholder for SK licensed symbol graphics/metadata.",
  },
  {
    id: "CompanyCustomSymbolPack",
    name: "Company custom symbols",
    trade: "electrical",
    countryCodes: ["SK", "CZ", "AT", "DE"],
    licenseStatus: "company_defined",
    connected: false,
    note: "Company-defined mappings (user confirmed / custom library).",
  },
  {
    id: "InternalSampleAliases",
    name: "Internal sample text aliases",
    trade: "electrical",
    countryCodes: ["SK", "CZ", "AT", "DE"],
    licenseStatus: "internal_sample",
    connected: true,
    note: "Safe starter aliases only — no official drawings.",
  },
];

export const SYMBOL_SOURCE_PRIORITY: SymbolSourceType[] = [
  "project_legend",
  "user_confirmed",
  "company_custom",
  "licensed_standard_pack",
  "standard_reference_metadata",
  "ai_inferred",
];

function entry(
  partial: Omit<
    SymbolLibraryEntry,
    "countries" | "countryCodes" | "textPatterns" | "confidenceWeight"
  > & {
    countries: string[];
    textPatterns?: string[];
    confidenceWeight?: number;
  }
): SymbolLibraryEntry {
  return {
    ...partial,
    countryCodes: partial.countries,
    countries: partial.countries,
    textPatterns: partial.textPatterns ?? partial.aliases,
    confidenceWeight: partial.confidenceWeight ?? 0.55,
  };
}

/** Safe starter electrical profile — text aliases only, no official drawings. */
export const ELECTRICAL_STARTER_SYMBOL_PROFILE: SymbolLibraryEntry[] = [
  entry({
    id: "sk_socket",
    trade: "electrical",
    countries: ["SK", "CZ", "AT", "DE"],
    sourceType: "standard_reference_metadata",
    standardRef: "IEC 60617",
    standardName: "IEC 60617 (architectural installation — metadata)",
    displayName: "Zásuvka",
    aliases: [
      "EL.zásuvka",
      "el.zásuvka",
      "zásuvka",
      "zasuvka",
      "el.zásuvka pod sebou",
      "zásuvky v nábytku",
      "zásuvky z prac.dosky",
      "zásuvky z prac dosky",
      "El.3zásuvky vedľa seba",
      "vývod zo zeme",
      "vyvod zo zeme",
      "podlahová zásuvka",
      "vývod pre varnú dosku",
      "Steckdose",
      "socket",
      "schuko",
    ],
    normalizedType: "socket",
    normalizedPoint: "socket_point",
    defaultUnit: "ks",
    quoteGroup: "sockets_switches",
    licenseStatus: "internal_sample",
    confidenceWeight: 0.6,
  }),
  entry({
    id: "sk_double_socket",
    trade: "electrical",
    countries: ["SK", "CZ"],
    sourceType: "standard_reference_metadata",
    displayName: "Dvojzásuvka",
    aliases: ["dvojzásuvka", "2x zásuvka", "2zásuvka", "el.2zásuvka", "double socket"],
    normalizedType: "double_socket",
    normalizedPoint: "double_socket_point",
    defaultUnit: "ks",
    quoteGroup: "sockets_switches",
    licenseStatus: "internal_sample",
    confidenceWeight: 0.65,
  }),
  entry({
    id: "sk_data_socket",
    trade: "electrical",
    countries: ["SK", "CZ", "DE"],
    sourceType: "standard_reference_metadata",
    displayName: "Dátová zásuvka",
    aliases: ["dátová zásuvka", "datova zasuvka", "UTP", "LAN", "slaboprúd", "data socket"],
    normalizedType: "data_socket",
    normalizedPoint: "data_socket",
    defaultUnit: "ks",
    quoteGroup: "sockets_switches",
    licenseStatus: "internal_sample",
  }),
  entry({
    id: "sk_switch",
    trade: "electrical",
    countries: ["SK", "CZ", "AT", "DE"],
    sourceType: "standard_reference_metadata",
    displayName: "Vypínač",
    aliases: ["vypínač", "vypinac", "spínač", "spinac", "Schalter", "switch"],
    normalizedType: "switch",
    normalizedPoint: "switch_point",
    defaultUnit: "ks",
    quoteGroup: "sockets_switches",
    licenseStatus: "internal_sample",
  }),
  entry({
    id: "sk_dimmer",
    trade: "electrical",
    countries: ["SK", "CZ", "DE"],
    sourceType: "standard_reference_metadata",
    displayName: "Stmievač",
    aliases: ["stmievač", "stmievac", "dimmer"],
    normalizedType: "dimmer",
    normalizedPoint: "dimmer_point",
    defaultUnit: "ks",
    quoteGroup: "sockets_switches",
    licenseStatus: "internal_sample",
  }),
  entry({
    id: "sk_pendant",
    trade: "electrical",
    countries: ["SK", "CZ", "DE"],
    sourceType: "standard_reference_metadata",
    displayName: "Visiace svietidlo",
    aliases: ["visiace svietidlo", "závesné svietidlo", "závesné", "pendant light", "pendant"],
    normalizedType: "pendant_light",
    normalizedPoint: "pendant_light_point",
    defaultUnit: "ks",
    quoteGroup: "lighting",
    licenseStatus: "internal_sample",
  }),
  entry({
    id: "sk_ceiling",
    trade: "electrical",
    countries: ["SK", "CZ", "DE"],
    sourceType: "standard_reference_metadata",
    displayName: "Stropné svietidlo",
    aliases: ["stropné svietidlo", "stropne svietidlo", "svetelný vývod", "ceiling light"],
    normalizedType: "ceiling_light",
    normalizedPoint: "ceiling_light_point",
    defaultUnit: "ks",
    quoteGroup: "lighting",
    licenseStatus: "internal_sample",
  }),
  entry({
    id: "sk_wall_light",
    trade: "electrical",
    countries: ["SK", "CZ", "DE"],
    sourceType: "standard_reference_metadata",
    displayName: "Nástenné osvetlenie",
    aliases: ["nástenné osvetlenie", "nastenne osvetlenie", "wall light"],
    normalizedType: "wall_light",
    normalizedPoint: "wall_light_point",
    defaultUnit: "ks",
    quoteGroup: "lighting",
    licenseStatus: "internal_sample",
  }),
  entry({
    id: "sk_led_strip",
    trade: "electrical",
    countries: ["SK", "CZ", "DE"],
    sourceType: "standard_reference_metadata",
    displayName: "LED pás",
    aliases: [
      "LED pás",
      "LED pas",
      "LED pás v SDK",
      "LED pás v svetelnej lište",
      "LED strip",
      "LED-Streifen",
    ],
    normalizedType: "led_strip",
    normalizedPoint: "led_strip_point",
    defaultUnit: "m",
    quoteGroup: "led",
    licenseStatus: "internal_sample",
  }),
  entry({
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
      "zapustené osvetlenie lišta",
      "zapustené osvetlenie",
      "lištový systém",
    ],
    normalizedType: "led_profile",
    normalizedPoint: "led_strip_point",
    defaultUnit: "m",
    quoteGroup: "led",
    licenseStatus: "internal_sample",
  }),
  entry({
    id: "sk_mirror",
    trade: "electrical",
    countries: ["SK", "CZ"],
    sourceType: "standard_reference_metadata",
    displayName: "Vývod / podsvietenie zrkadla",
    aliases: ["podsvietenie zrkadla", "podsvietenie zrkadlo", "vývod pre zrkadlo", "mirror light"],
    normalizedType: "mirror_light_output",
    normalizedPoint: "mirror_light_output",
    defaultUnit: "ks",
    quoteGroup: "lighting",
    licenseStatus: "internal_sample",
  }),
  entry({
    id: "sk_furniture",
    trade: "electrical",
    countries: ["SK", "CZ"],
    sourceType: "standard_reference_metadata",
    displayName: "Podsvietenie nábytku",
    aliases: [
      "podsvietenie nábytku",
      "podsvietenie vitrína",
      "podsvietenie vitríny",
      "podsvietenie skriniek",
      "podsvietenie príborník",
      "podsvietenie príborníka",
      "vývod pre nábytok",
      "furniture light",
    ],
    normalizedType: "furniture_light_output",
    normalizedPoint: "furniture_light_output",
    defaultUnit: "ks",
    quoteGroup: "lighting",
    licenseStatus: "internal_sample",
  }),
  entry({
    id: "sk_db",
    trade: "electrical",
    countries: ["SK", "CZ", "DE"],
    sourceType: "standard_reference_metadata",
    displayName: "Rozvádzač",
    aliases: ["rozvádzač", "rozvadzac", "RZ", "hlavný rozvádzač", "distribution board"],
    normalizedType: "distribution_board",
    normalizedPoint: "distribution_board",
    defaultUnit: "ks",
    quoteGroup: "distribution_board",
    licenseStatus: "internal_sample",
  }),
  entry({
    id: "sk_cable",
    trade: "electrical",
    countries: ["SK", "CZ", "DE"],
    sourceType: "standard_reference_metadata",
    displayName: "Kabeláž / káblová trasa",
    aliases: ["kábel", "kabel", "CYKY", "NYM", "dátový kábel", "UTP", "slaboprúd", "cable"],
    normalizedType: "cable_route",
    normalizedPoint: "cable_route",
    defaultUnit: "m",
    quoteGroup: "cabling",
    licenseStatus: "internal_sample",
  }),
];

export function matchStarterSymbol(text: string): SymbolLibraryEntry | null {
  const hay = text.trim().toLowerCase();
  if (!hay) return null;
  for (const e of ELECTRICAL_STARTER_SYMBOL_PROFILE) {
    if (
      e.aliases.some((a) => hay.includes(a.toLowerCase())) ||
      e.textPatterns.some((p) => hay.includes(p.toLowerCase()))
    ) {
      return e;
    }
  }
  return null;
}

export function mapNormalizedToLegacyType(t: SymbolNormalizedType): string {
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

export function toNormalizedElectricalPoint(
  t: SymbolNormalizedType | string
): NormalizedElectricalPoint {
  switch (t) {
    case "socket":
      return "socket_point";
    case "double_socket":
      return "double_socket_point";
    case "switch":
      return "switch_point";
    case "dimmer":
      return "dimmer_point";
    case "ceiling_light":
      return "ceiling_light_point";
    case "pendant_light":
      return "pendant_light_point";
    case "wall_light":
      return "wall_light_point";
    case "led_strip":
    case "led_profile":
    case "lighting_profile":
      return "led_strip_point";
    case "mirror_light_output":
      return "mirror_light_output";
    case "furniture_light_output":
    case "furniture_light":
      return "furniture_light_output";
    case "distribution_board":
      return "distribution_board";
    case "data_socket":
      return "data_socket";
    case "cable_route":
      return "cable_route";
    case "light_output":
      return "light_output";
    case "installation_box":
      return "installation_box";
    case "breaker":
      return "breaker";
    case "grounding":
      return "grounding";
    default:
      return "unknown";
  }
}
