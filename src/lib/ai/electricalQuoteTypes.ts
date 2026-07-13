/**
 * Two-layer electrical estimator model:
 * A) InternalTakeoff — detailed extraction for the rozpočtár
 * B) QuotePackage — grouped customer-facing offer (never raw AI rows)
 */

export type TakeoffConfidence = "high" | "medium" | "low";

export type TakeoffSource =
  | "project_legend"
  | "symbol_occurrence"
  | "ocr_text"
  | "inferred"
  | "assumption"
  | "visual_detection"
  | "company_template"
  | "user";

export type InternalTakeoffRow = {
  id: string;
  roomName?: string;
  symbolLabel?: string;
  title: string;
  category:
    | "lighting"
    | "led_strip"
    | "socket"
    | "switch"
    | "cable"
    | "distribution_board"
    | "installation_material"
    | "labor"
    | "testing"
    | "other";
  quantity?: number;
  unit: string;
  sourcePage?: number;
  source: TakeoffSource;
  confidence: TakeoffConfidence;
  needsReview: boolean;
  reviewReason?: string;
  included: boolean;
};

export type QuotePackageGroupId =
  | "preparation"
  | "wall_chasing"
  | "cabling"
  | "installation_boxes"
  | "sockets_switches"
  | "lighting"
  | "led"
  | "distribution_board"
  | "testing"
  | "assumptions"
  | "exclusions"
  | "other";

export type QuotePackageLine = {
  id: string;
  groupId: QuotePackageGroupId;
  title: string;
  description?: string;
  quantity?: number;
  unit: string;
  unitPrice?: number;
  /** true when price missing — never present 0 as a real price */
  priceMissing?: boolean;
  needsReview?: boolean;
  included: boolean;
  customerVisible: boolean;
  basis?: string;
};

export type QuotePackageSection = {
  id: QuotePackageGroupId;
  titleSk: string;
  titleEn: string;
  lines: QuotePackageLine[];
  assumptions?: string[];
  exclusions?: string[];
};

export type QuotePackage = {
  language: "sk" | "de" | "en";
  intro: string;
  scopeSummary: string;
  sections: QuotePackageSection[];
  assumptions: string[];
  exclusions: string[];
  openPoints: string[];
  validityNote: string;
  status: "draft" | "preliminary" | "ready";
  blockedReasons: string[];
  warnings: string[];
};

export type ElectricalCompletenessCategory =
  | "lighting_points"
  | "led_strips"
  | "sockets"
  | "switches"
  | "cable_routes_or_cabling_assumption"
  | "installation_boxes"
  | "wall_chasing_or_surface_mounting_assumption"
  | "distribution_board_or_explicitly_not_in_scope"
  | "testing_commissioning"
  | "revision_or_explicitly_not_in_scope"
  | "material_supply_assumption"
  | "customer_supplied_fixtures_assumption";

export type CompletenessFinding = {
  category: ElectricalCompletenessCategory;
  status: "present" | "missing" | "needs_review" | "explicitly_excluded";
  messageSk: string;
  blocksFixedQuote: boolean;
};

export const QUOTE_GROUP_ORDER: QuotePackageGroupId[] = [
  "preparation",
  "wall_chasing",
  "cabling",
  "installation_boxes",
  "sockets_switches",
  "lighting",
  "led",
  "distribution_board",
  "testing",
  "assumptions",
  "exclusions",
  "other",
];

export const QUOTE_GROUP_TITLES: Record<
  QuotePackageGroupId,
  { sk: string; en: string; de: string }
> = {
  preparation: {
    sk: "Príprava a kontrola podkladov",
    en: "Preparation and site verification",
    de: "Vorbereitung und Kontrolle",
  },
  wall_chasing: {
    sk: "Drážkovanie / sekanie / prestupy",
    en: "Wall chasing / openings",
    de: "Schlitzen / Durchbrüche",
  },
  cabling: {
    sk: "Kabeláž a príprava trás",
    en: "Cable routes and cabling",
    de: "Kabelwege und Verkabelung",
  },
  installation_boxes: {
    sk: "Krabice, chráničky a montážny materiál",
    en: "Boxes, conduits and mounting material",
    de: "Dosen, Rohre und Montagematerial",
  },
  sockets_switches: {
    sk: "Zásuvky a vypínače",
    en: "Sockets and switches",
    de: "Steckdosen und Schalter",
  },
  lighting: {
    sk: "Svetelné vývody",
    en: "Lighting outputs",
    de: "Lichtauslässe",
  },
  led: {
    sk: "LED pásy, profily a ovládanie",
    en: "LED strips / profiles / control",
    de: "LED-Streifen / Profile / Steuerung",
  },
  distribution_board: {
    sk: "Rozvádzač a istenie",
    en: "Distribution board",
    de: "Verteiler und Absicherung",
  },
  testing: {
    sk: "Skúšky, revízia a odovzdanie",
    en: "Testing / commissioning / handover",
    de: "Prüfung / Inbetriebnahme / Übergabe",
  },
  assumptions: {
    sk: "Predpoklady",
    en: "Assumptions",
    de: "Annahmen",
  },
  exclusions: {
    sk: "Výluky",
    en: "Exclusions",
    de: "Ausschlüsse",
  },
  other: {
    sk: "Ostatné",
    en: "Other",
    de: "Sonstiges",
  },
};
