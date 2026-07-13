/**
 * Electrical assembly templates — symbol becomes a technical point,
 * then expands into materials + labor (not a product yet).
 */

import type { ProductCategory } from "@/lib/products/productSourcingTypes";

export type NormalizedElectricalPoint =
  | "socket_point"
  | "double_socket_point"
  | "switch_point"
  | "dimmer_point"
  | "ceiling_light_point"
  | "pendant_light_point"
  | "wall_light_point"
  /** Generic light output when fixture type is not specified. */
  | "light_output"
  | "led_strip_point"
  | "mirror_light_output"
  | "furniture_light_output"
  | "installation_box"
  | "distribution_board"
  | "breaker"
  | "grounding"
  | "data_socket"
  | "cable_route"
  | "unknown";

export type AssemblyQuoteGroup =
  | "sockets_switches"
  | "lighting"
  | "led_systems"
  | "cabling"
  | "installation_material"
  | "distribution_board"
  | "testing_revision";

export type AssemblyMaterialComponent = {
  category: ProductCategory;
  title: string;
  quantityFormula: string;
  unit: "ks" | "m" | "bal" | "set";
  productRequired: boolean;
  priceRequired: boolean;
  requiredSpecs?: string[];
};

export type AssemblyLaborComponent = {
  title: string;
  timeFormula: string;
  unit: "h";
  defaultMinutesPerUnit?: number;
};

export type ElectricalAssemblyTemplate = {
  id: string;
  normalizedPoint: NormalizedElectricalPoint;
  title: string;
  quoteGroup: AssemblyQuoteGroup;
  defaultUnit: "ks" | "m" | "bod" | "set";
  materialComponents: AssemblyMaterialComponent[];
  laborComponents: AssemblyLaborComponent[];
  requiredQuestions: string[];
  assumptions: string[];
  riskFlags: string[];
};

export const ELECTRICAL_ASSEMBLY_TEMPLATES: ElectricalAssemblyTemplate[] = [
  {
    id: "socket_point_standard",
    normalizedPoint: "socket_point",
    title: "Zásuvkový bod (štandard)",
    quoteGroup: "sockets_switches",
    defaultUnit: "ks",
    materialComponents: [
      {
        category: "socket",
        title: "Zásuvka 230V",
        quantityFormula: "qty",
        unit: "ks",
        productRequired: true,
        priceRequired: true,
      },
      {
        category: "other",
        title: "Rámik / kryt",
        quantityFormula: "qty",
        unit: "ks",
        productRequired: true,
        priceRequired: true,
      },
      {
        category: "installation_box",
        title: "Inštalačná krabica",
        quantityFormula: "qty",
        unit: "ks",
        productRequired: true,
        priceRequired: true,
      },
      {
        category: "cable",
        title: "Kabeláž k zásuvke (placeholder)",
        quantityFormula: "needs_measure",
        unit: "m",
        productRequired: true,
        priceRequired: false,
        requiredSpecs: ["cable_type", "length_m"],
      },
      {
        category: "terminal",
        title: "Svorky / spojovací materiál",
        quantityFormula: "qty * 2",
        unit: "ks",
        productRequired: false,
        priceRequired: false,
      },
      {
        category: "mounting_material",
        title: "Montážny materiál",
        quantityFormula: "qty",
        unit: "set",
        productRequired: false,
        priceRequired: false,
      },
    ],
    laborComponents: [
      {
        title: "Montáž a zapojenie zásuvky",
        timeFormula: "qty * 0.35",
        unit: "h",
        defaultMinutesPerUnit: 21,
      },
    ],
    requiredQuestions: ["Je v cene sekanie / drážkovanie?"],
    assumptions: ["Finálna značka/séria podľa preferencií firmy."],
    riskFlags: ["cable_length_not_measured"],
  },
  {
    id: "double_socket_point_standard",
    normalizedPoint: "double_socket_point",
    title: "Dvojzásuvkový bod",
    quoteGroup: "sockets_switches",
    defaultUnit: "ks",
    materialComponents: [
      {
        category: "socket",
        title: "Dvojzásuvka 230V",
        quantityFormula: "qty",
        unit: "ks",
        productRequired: true,
        priceRequired: true,
      },
      {
        category: "other",
        title: "Rámik",
        quantityFormula: "qty",
        unit: "ks",
        productRequired: true,
        priceRequired: true,
      },
      {
        category: "installation_box",
        title: "Inštalačná krabica",
        quantityFormula: "qty",
        unit: "ks",
        productRequired: true,
        priceRequired: true,
      },
      {
        category: "cable",
        title: "Kabeláž (placeholder)",
        quantityFormula: "needs_measure",
        unit: "m",
        productRequired: true,
        priceRequired: false,
        requiredSpecs: ["cable_type", "length_m"],
      },
    ],
    laborComponents: [
      {
        title: "Montáž dvojzásuvky",
        timeFormula: "qty * 0.4",
        unit: "h",
        defaultMinutesPerUnit: 24,
      },
    ],
    requiredQuestions: ["Je v cene sekanie / drážkovanie?"],
    assumptions: [],
    riskFlags: ["cable_length_not_measured"],
  },
  {
    id: "switch_point_standard",
    normalizedPoint: "switch_point",
    title: "Vypínačový bod",
    quoteGroup: "sockets_switches",
    defaultUnit: "ks",
    materialComponents: [
      {
        category: "switch",
        title: "Vypínač",
        quantityFormula: "qty",
        unit: "ks",
        productRequired: true,
        priceRequired: true,
      },
      {
        category: "other",
        title: "Rámik",
        quantityFormula: "qty",
        unit: "ks",
        productRequired: true,
        priceRequired: true,
      },
      {
        category: "installation_box",
        title: "Inštalačná krabica",
        quantityFormula: "qty",
        unit: "ks",
        productRequired: true,
        priceRequired: true,
      },
      {
        category: "cable",
        title: "Ovládacia kabeláž (placeholder)",
        quantityFormula: "needs_measure",
        unit: "m",
        productRequired: true,
        priceRequired: false,
        requiredSpecs: ["cable_type", "length_m"],
      },
    ],
    laborComponents: [
      {
        title: "Montáž vypínača",
        timeFormula: "qty * 0.3",
        unit: "h",
        defaultMinutesPerUnit: 18,
      },
    ],
    requiredQuestions: [],
    assumptions: [],
    riskFlags: ["cable_length_not_measured"],
  },
  {
    id: "dimmer_point_standard",
    normalizedPoint: "dimmer_point",
    title: "Stmievačový bod",
    quoteGroup: "sockets_switches",
    defaultUnit: "ks",
    materialComponents: [
      {
        category: "switch",
        title: "Stmievač",
        quantityFormula: "qty",
        unit: "ks",
        productRequired: true,
        priceRequired: true,
        requiredSpecs: ["load_type", "max_watt"],
      },
      {
        category: "installation_box",
        title: "Inštalačná krabica",
        quantityFormula: "qty",
        unit: "ks",
        productRequired: true,
        priceRequired: true,
      },
    ],
    laborComponents: [
      {
        title: "Montáž stmievača",
        timeFormula: "qty * 0.4",
        unit: "h",
        defaultMinutesPerUnit: 24,
      },
    ],
    requiredQuestions: ["Typ záťaže (LED / klasická)?"],
    assumptions: [],
    riskFlags: ["missing_dimmer_specs"],
  },
  {
    id: "ceiling_light_point",
    normalizedPoint: "ceiling_light_point",
    title: "Svetelný vývod (strop)",
    quoteGroup: "lighting",
    defaultUnit: "ks",
    materialComponents: [
      {
        category: "light_fixture",
        title: "Príprava vývodu / svietidlo",
        quantityFormula: "qty",
        unit: "ks",
        productRequired: false,
        priceRequired: false,
      },
      {
        category: "mounting_material",
        title: "Montážny materiál vývodu",
        quantityFormula: "qty",
        unit: "set",
        productRequired: true,
        priceRequired: true,
      },
      {
        category: "cable",
        title: "Kabeláž k vývodu (placeholder)",
        quantityFormula: "needs_measure",
        unit: "m",
        productRequired: true,
        priceRequired: false,
        requiredSpecs: ["length_m"],
      },
    ],
    laborComponents: [
      {
        title: "Príprava a zapojenie vývodu",
        timeFormula: "qty * 0.45",
        unit: "h",
        defaultMinutesPerUnit: 27,
      },
    ],
    requiredQuestions: ["Svietidlo dodáva zákazník alebo firma?"],
    assumptions: ["Montáž svietidla môže byť vylúčená, ak dodáva zákazník."],
    riskFlags: ["fixture_supply_unclear"],
  },
  {
    id: "pendant_light_point",
    normalizedPoint: "pendant_light_point",
    title: "Vývod pre visiace svietidlo",
    quoteGroup: "lighting",
    defaultUnit: "ks",
    materialComponents: [
      {
        category: "light_fixture",
        title: "Príprava závesného vývodu",
        quantityFormula: "qty",
        unit: "ks",
        productRequired: false,
        priceRequired: false,
      },
      {
        category: "mounting_material",
        title: "Montážny materiál",
        quantityFormula: "qty",
        unit: "set",
        productRequired: true,
        priceRequired: true,
      },
    ],
    laborComponents: [
      {
        title: "Príprava závesného vývodu",
        timeFormula: "qty * 0.5",
        unit: "h",
        defaultMinutesPerUnit: 30,
      },
    ],
    requiredQuestions: ["Svietidlo dodáva zákazník alebo firma?"],
    assumptions: [],
    riskFlags: ["fixture_supply_unclear"],
  },
  {
    id: "wall_light_point",
    normalizedPoint: "wall_light_point",
    title: "Nástenný svetelný vývod",
    quoteGroup: "lighting",
    defaultUnit: "ks",
    materialComponents: [
      {
        category: "light_fixture",
        title: "Príprava nástenného vývodu",
        quantityFormula: "qty",
        unit: "ks",
        productRequired: false,
        priceRequired: false,
      },
      {
        category: "installation_box",
        title: "Krabica / uchytenie",
        quantityFormula: "qty",
        unit: "ks",
        productRequired: true,
        priceRequired: true,
      },
    ],
    laborComponents: [
      {
        title: "Príprava nástenného vývodu",
        timeFormula: "qty * 0.4",
        unit: "h",
        defaultMinutesPerUnit: 24,
      },
    ],
    requiredQuestions: ["Svietidlo dodáva zákazník alebo firma?"],
    assumptions: [],
    riskFlags: ["fixture_supply_unclear"],
  },
  {
    id: "led_strip_system",
    normalizedPoint: "led_strip_point",
    title: "LED systém (pás + profil + zdroj)",
    quoteGroup: "led_systems",
    defaultUnit: "m",
    materialComponents: [
      {
        category: "led_strip",
        title: "LED pás",
        quantityFormula: "qty * 1.08",
        unit: "m",
        productRequired: true,
        priceRequired: true,
        requiredSpecs: ["voltage", "w_per_m", "cct", "ip_rating"],
      },
      {
        category: "led_profile",
        title: "LED profil + difúzor",
        quantityFormula: "qty",
        unit: "m",
        productRequired: true,
        priceRequired: true,
      },
      {
        category: "led_driver",
        title: "LED zdroj / driver",
        quantityFormula: "ceil(qty * w_per_m / driver_watt)",
        unit: "ks",
        productRequired: true,
        priceRequired: true,
        requiredSpecs: ["voltage", "w_per_m", "control_type"],
      },
      {
        category: "mounting_material",
        title: "Konektory / spojky",
        quantityFormula: "max(2, ceil(qty / 5))",
        unit: "ks",
        productRequired: true,
        priceRequired: true,
      },
      {
        category: "cable",
        title: "Napájací kábel",
        quantityFormula: "needs_measure",
        unit: "m",
        productRequired: true,
        priceRequired: false,
        requiredSpecs: ["length_m"],
      },
    ],
    laborComponents: [
      {
        title: "Montáž LED systému",
        timeFormula: "qty * 0.25",
        unit: "h",
        defaultMinutesPerUnit: 15,
      },
    ],
    requiredQuestions: [
      "Napätie (12/24V)?",
      "W/m?",
      "CCT (teplota farby)?",
      "IP krytie?",
      "Typ ovládania?",
    ],
    assumptions: ["Rezerva dĺžky pásu ~8 %."],
    riskFlags: ["missing_led_specs", "cable_length_not_measured"],
  },
  {
    id: "mirror_light_output",
    normalizedPoint: "mirror_light_output",
    title: "Vývod pre podsvietenie zrkadla",
    quoteGroup: "lighting",
    defaultUnit: "ks",
    materialComponents: [
      {
        category: "mounting_material",
        title: "Príprava vývodu",
        quantityFormula: "qty",
        unit: "set",
        productRequired: true,
        priceRequired: true,
      },
    ],
    laborComponents: [
      {
        title: "Príprava vývodu zrkadla",
        timeFormula: "qty * 0.35",
        unit: "h",
        defaultMinutesPerUnit: 21,
      },
    ],
    requiredQuestions: ["Zrkadlo / LED dodáva zákazník?"],
    assumptions: [],
    riskFlags: ["fixture_supply_unclear"],
  },
  {
    id: "furniture_light_output",
    normalizedPoint: "furniture_light_output",
    title: "Vývod pre podsvietenie nábytku",
    quoteGroup: "lighting",
    defaultUnit: "ks",
    materialComponents: [
      {
        category: "mounting_material",
        title: "Príprava vývodu",
        quantityFormula: "qty",
        unit: "set",
        productRequired: true,
        priceRequired: true,
      },
    ],
    laborComponents: [
      {
        title: "Príprava vývodu nábytku",
        timeFormula: "qty * 0.3",
        unit: "h",
        defaultMinutesPerUnit: 18,
      },
    ],
    requiredQuestions: ["Osvetlenie nábytku dodáva zákazník?"],
    assumptions: [],
    riskFlags: ["fixture_supply_unclear"],
  },
  {
    id: "data_socket_point",
    normalizedPoint: "data_socket",
    title: "Dátová zásuvka",
    quoteGroup: "sockets_switches",
    defaultUnit: "ks",
    materialComponents: [
      {
        category: "socket",
        title: "Dátová zásuvka / keystone",
        quantityFormula: "qty",
        unit: "ks",
        productRequired: true,
        priceRequired: true,
        requiredSpecs: ["category_cat"],
      },
      {
        category: "cable",
        title: "UTP / dátový kábel",
        quantityFormula: "needs_measure",
        unit: "m",
        productRequired: true,
        priceRequired: false,
        requiredSpecs: ["length_m", "category_cat"],
      },
    ],
    laborComponents: [
      {
        title: "Montáž dátovej zásuvky",
        timeFormula: "qty * 0.35",
        unit: "h",
        defaultMinutesPerUnit: 21,
      },
    ],
    requiredQuestions: ["Kategória kábla (Cat5e/Cat6)?"],
    assumptions: [],
    riskFlags: ["cable_length_not_measured"],
  },
  {
    id: "distribution_board_basic",
    normalizedPoint: "distribution_board",
    title: "Rozvádzač (základ)",
    quoteGroup: "distribution_board",
    defaultUnit: "ks",
    materialComponents: [
      {
        category: "distribution_board",
        title: "Rozvádzač / skriňa",
        quantityFormula: "qty",
        unit: "ks",
        productRequired: true,
        priceRequired: true,
        requiredSpecs: ["module_count"],
      },
      {
        category: "breaker",
        title: "Ističe / RCD (placeholder)",
        quantityFormula: "needs_spec",
        unit: "ks",
        productRequired: true,
        priceRequired: true,
        requiredSpecs: ["circuit_list"],
      },
      {
        category: "other",
        title: "Štítky / popisovače",
        quantityFormula: "1",
        unit: "set",
        productRequired: false,
        priceRequired: false,
      },
    ],
    laborComponents: [
      {
        title: "Zapojenie rozvádzača",
        timeFormula: "needs_spec",
        unit: "h",
        defaultMinutesPerUnit: 120,
      },
    ],
    requiredQuestions: [
      "Počet modulov / ističov?",
      "Je rozvádzač súčasťou rozsahu?",
    ],
    assumptions: ["Bez detailnej špecifikácie len orientačne."],
    riskFlags: ["db_underspecified"],
  },
  {
    id: "cable_route_placeholder",
    normalizedPoint: "cable_route",
    title: "Kabeláž / trasa (treba zamerať)",
    quoteGroup: "cabling",
    defaultUnit: "m",
    materialComponents: [
      {
        category: "cable",
        title: "Kábel podľa typu",
        quantityFormula: "needs_measure",
        unit: "m",
        productRequired: true,
        priceRequired: false,
        requiredSpecs: ["cable_type", "length_m"],
      },
      {
        category: "conduit",
        title: "Chránička / rúra (ak treba)",
        quantityFormula: "needs_measure",
        unit: "m",
        productRequired: false,
        priceRequired: false,
      },
    ],
    laborComponents: [
      {
        title: "Pokládka kábla",
        timeFormula: "needs_measure",
        unit: "h",
      },
    ],
    requiredQuestions: ["Typ a dĺžka kábla po zameraní?"],
    assumptions: ["Dĺžky sa nevymýšľajú z počtu zásuviek."],
    riskFlags: ["cable_length_not_measured"],
  },
  {
    id: "light_output_standard",
    normalizedPoint: "light_output",
    title: "Svetelný vývod (štandard)",
    quoteGroup: "lighting",
    defaultUnit: "ks",
    materialComponents: [
      {
        category: "installation_box",
        title: "Krabica / prípojné miesto",
        quantityFormula: "qty",
        unit: "ks",
        productRequired: true,
        priceRequired: true,
      },
      {
        category: "terminal",
        title: "Svorky / ukončenie kábla",
        quantityFormula: "qty",
        unit: "ks",
        productRequired: false,
        priceRequired: false,
      },
      {
        category: "mounting_material",
        title: "Montážny materiál",
        quantityFormula: "qty",
        unit: "set",
        productRequired: false,
        priceRequired: false,
      },
    ],
    laborComponents: [
      {
        title: "Príprava a zapojenie svetelného vývodu",
        timeFormula: "qty * 0.5",
        unit: "h",
        defaultMinutesPerUnit: 30,
      },
    ],
    requiredQuestions: ["Svietidlo dodáva zákazník alebo firma?"],
    assumptions: ["Vývod bez svietidla, pokiaľ nie je uvedené inak."],
    riskFlags: [],
  },
  {
    id: "installation_box_standard",
    normalizedPoint: "installation_box",
    title: "Inštalačná krabica (štandard)",
    quoteGroup: "installation_material",
    defaultUnit: "ks",
    materialComponents: [
      {
        category: "installation_box",
        title: "Inštalačná / podomietková krabica",
        quantityFormula: "qty",
        unit: "ks",
        productRequired: true,
        priceRequired: true,
      },
    ],
    laborComponents: [
      {
        title: "Osadenie krabice",
        timeFormula: "qty * 0.25",
        unit: "h",
        defaultMinutesPerUnit: 15,
      },
    ],
    requiredQuestions: ["Typ steny (murivo / SDK / betón)?"],
    assumptions: [],
    riskFlags: [],
  },
  {
    id: "testing_revision",
    normalizedPoint: "unknown",
    title: "Skúšky a odovzdanie",
    quoteGroup: "testing_revision",
    defaultUnit: "set",
    materialComponents: [],
    laborComponents: [
      {
        title: "Merania / skúšky",
        timeFormula: "1",
        unit: "h",
        defaultMinutesPerUnit: 120,
      },
      {
        title: "Protokol / odovzdanie",
        timeFormula: "0.5",
        unit: "h",
        defaultMinutesPerUnit: 30,
      },
    ],
    requiredQuestions: ["Je v rozsahu aj revízia?"],
    assumptions: [],
    riskFlags: [],
  },
];

export function findAssemblyTemplate(
  point: NormalizedElectricalPoint
): ElectricalAssemblyTemplate | undefined {
  if (point === "unknown") return undefined;
  const direct = ELECTRICAL_ASSEMBLY_TEMPLATES.find((t) => t.normalizedPoint === point);
  if (direct) return direct;
  // Fallbacks for points without a dedicated template.
  if (point === "breaker" || point === "grounding") {
    return ELECTRICAL_ASSEMBLY_TEMPLATES.find((t) => t.id === "distribution_board_basic");
  }
  return undefined;
}

export const QUOTE_GROUP_LABELS_SK: Record<AssemblyQuoteGroup, string> = {
  sockets_switches: "Zásuvky a vypínače",
  lighting: "Svetelné vývody",
  led_systems: "LED systémy",
  cabling: "Kabeláž a montážny materiál",
  installation_material: "Montážny materiál",
  distribution_board: "Rozvádzač a istenie",
  testing_revision: "Skúšky a odovzdanie",
};
