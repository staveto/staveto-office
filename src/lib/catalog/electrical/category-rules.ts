/**
 * Deterministic electrical category taxonomy + classifier (no AI).
 * Profession-oriented structure for tradeId "electrical".
 */

import { normalizeCatalogName, slugifyCatalog } from "./normalizeName";
import type { ClassificationHit, ElectricalProductAttributes } from "./types";

export type ElectricalCategoryDef = {
  slug: string;
  name: string;
  children?: Array<{ slug: string; name: string }>;
};

export const ELECTRICAL_TRADE_ID = "electrical";

export const ELECTRICAL_CATEGORY_TREE: ElectricalCategoryDef[] = [
  {
    slug: "vypinace-a-ovladace",
    name: "Vypínače a ovládače",
    children: [
      { slug: "vypinac-c1", name: "Vypínač č. 1" },
      { slug: "vypinac-c5", name: "Vypínač č. 5" },
      { slug: "vypinac-c5b", name: "Vypínač č. 5B" },
      { slug: "vypinac-c6", name: "Vypínač č. 6" },
      { slug: "vypinac-c7", name: "Vypínač č. 7" },
      { slug: "tlacidla", name: "Tlačidlá" },
      { slug: "stmievace", name: "Stmievače" },
      { slug: "zaluziove-ovladace", name: "Žalúziové ovládače" },
      { slug: "pohybove-snimace", name: "Pohybové snímače" },
      { slug: "termostaty", name: "Termostaty" },
      { slug: "ramceky-a-kryty", name: "Rámčeky a kryty" },
      { slug: "ostatne-ovladace", name: "Ostatné ovládače" },
    ],
  },
  {
    slug: "zasuvky-a-konektory",
    name: "Zásuvky a konektory",
    children: [
      { slug: "zasuvky-230v", name: "Zásuvky 230 V" },
      { slug: "dvojzasuvky", name: "Dvojzásuvky" },
      { slug: "zasuvky-ip44", name: "Zásuvky IP44 a vyššie" },
      { slug: "datove-zasuvky", name: "Dátové zásuvky" },
      { slug: "tv-sat-zasuvky", name: "TV a SAT zásuvky" },
      { slug: "usb-nabijacky", name: "USB nabíjačky" },
      { slug: "multimedialne-zasuvky", name: "Reproduktorové a multimediálne zásuvky" },
      { slug: "kablove-vyvody", name: "Káblové vývody" },
      { slug: "zaslepky", name: "Záslepky" },
    ],
  },
  {
    slug: "istice-a-ochranne-pristroje",
    name: "Ističe a ochranné prístroje",
    children: [
      { slug: "istice", name: "Ističe" },
      { slug: "prudove-chranice", name: "Prúdové chrániče" },
      { slug: "kombinovane-chranice", name: "Kombinované chrániče" },
      { slug: "zvodice-prepatia", name: "Zvodiče prepätia" },
      { slug: "afdd", name: "AFDD" },
      { slug: "poistkove-odpinace", name: "Poistkové odpínače" },
      { slug: "poistky", name: "Poistky" },
    ],
  },
  {
    slug: "pristroje-pre-rozvadzace",
    name: "Prístroje pre rozvádzače",
    children: [
      { slug: "stykace", name: "Stykače" },
      { slug: "rele", name: "Relé" },
      { slug: "casove-rele", name: "Časové relé" },
      { slug: "meracie-pristroje", name: "Meracie prístroje" },
      { slug: "svorkovnice-rozvadzac", name: "Svorkovnice do rozvádzača" },
    ],
  },
  {
    slug: "rozvodnice-a-skrine",
    name: "Rozvodnice a skrine",
    children: [
      { slug: "rozvodnice", name: "Rozvodnice" },
      { slug: "skrine", name: "Skrine" },
      { slug: "dvierka-a-prislusenstvo", name: "Dvierka a príslušenstvo" },
    ],
  },
  {
    slug: "kable-a-vodice",
    name: "Káble a vodiče",
    children: [
      { slug: "instalacne-kable", name: "Inštalačné káble" },
      { slug: "datove-kable", name: "Dátové káble" },
      { slug: "ovladacie-kable", name: "Ovládacie káble" },
      { slug: "solarne-kable", name: "Solárne káble" },
    ],
  },
  {
    slug: "instalacne-krabice",
    name: "Inštalačné krabice",
    children: [
      { slug: "krabice-do-omietky", name: "Krabice do omietky" },
      { slug: "krabice-na-omietku", name: "Krabice na omietku" },
      { slug: "krabice-podlahove", name: "Podlahové krabice" },
    ],
  },
  {
    slug: "rurky-listy-a-kablove-trasy",
    name: "Rúrky, lišty a káblové trasy",
    children: [
      { slug: "rurky", name: "Rúrky" },
      { slug: "listy", name: "Lišty" },
      { slug: "zlaby", name: "Žľaby" },
      { slug: "uchyty", name: "Úchyty a príslušenstvo" },
    ],
  },
  {
    slug: "svorky-a-spojovaci-material",
    name: "Svorky a spojovací materiál",
    children: [
      { slug: "radove-svorky", name: "Radové svorky" },
      { slug: "wago-svorky", name: "WAGO / bezskrutkové svorky" },
      { slug: "kabelove-oka", name: "Káblové oká a koncovky" },
    ],
  },
  {
    slug: "osvetlenie",
    name: "Osvetlenie",
    children: [
      { slug: "svietidla", name: "Svietidlá" },
      { slug: "zarovky-a-zdroje", name: "Žiarovky a zdroje" },
      { slug: "nouzove-osvetlenie", name: "Núdzové osvetlenie" },
    ],
  },
  {
    slug: "strukturovana-kabelaz",
    name: "Štruktúrovaná kabeláž",
    children: [
      { slug: "patch-panely", name: "Patch panely" },
      { slug: "moduly-keystone", name: "Moduly Keystone" },
      { slug: "patch-kable", name: "Patch káble" },
    ],
  },
  {
    slug: "uzemnenie-a-bleskozvody",
    name: "Uzemnenie a bleskozvody",
    children: [
      { slug: "bleskozvodny-material", name: "Bleskozvodný materiál" },
      { slug: "uzemnovacie-tyce", name: "Uzemňovacie tyče" },
      { slug: "uzemnovacie-svorky", name: "Uzemňovacie svorky" },
    ],
  },
  {
    slug: "priemyselne-zasuvky-a-vidlice",
    name: "Priemyselné zásuvky a vidlice",
    children: [
      { slug: "cee-zasuvky", name: "CEE zásuvky" },
      { slug: "cee-vidlice", name: "CEE vidlice" },
    ],
  },
  {
    slug: "fotovoltika",
    name: "Fotovoltika",
    children: [
      { slug: "pv-menice", name: "Meniče" },
      { slug: "pv-prislusenstvo", name: "PV príslušenstvo" },
    ],
  },
  {
    slug: "elektromobilita",
    name: "Elektromobilita",
    children: [
      { slug: "wallboxy", name: "Wallboxy" },
      { slug: "ev-kable", name: "EV káble" },
    ],
  },
  {
    slug: "vykurovanie-a-ventilacia",
    name: "Vykurovanie a ventilácia",
    children: [
      { slug: "elektricke-kurene", name: "Elektrické kúrenie" },
      { slug: "ventilatory", name: "Ventilátory" },
    ],
  },
  {
    slug: "naradie-a-pracovne-pomocky",
    name: "Náradie a pracovné pomôcky",
    children: [
      { slug: "meracie-naradie", name: "Meracie náradie" },
      { slug: "rucne-naradie", name: "Ručné náradie" },
    ],
  },
  {
    slug: "ostatne-elektro",
    name: "Ostatné elektro",
    children: [{ slug: "neklasifikovane", name: "Neklasifikované" }],
  },
];

export function categoryDocId(slug: string, parentSlug?: string | null): string {
  return parentSlug
    ? `${ELECTRICAL_TRADE_ID}__${parentSlug}__${slug}`
    : `${ELECTRICAL_TRADE_ID}__${slug}`;
}

type Rule = {
  topSlug: string;
  childSlug: string | null;
  confidence: number;
  productType?: string | null;
  test: (ctx: { text: string; url: string; sourcePath: string }) => boolean;
  attributes?: (ctx: { text: string }) => ElectricalProductAttributes;
};

function any(...parts: string[]) {
  return (text: string) => parts.some((p) => text.includes(normalizeCatalogName(p)));
}

const RULES: Rule[] = [
  // Switches — specific numbers first
  {
    topSlug: "vypinace-a-ovladace",
    childSlug: "vypinac-c5b",
    confidence: 0.95,
    productType: "switch_5b",
    test: ({ text }) =>
      /\bvypinac\s*c\s*5\s*b\b/.test(text) ||
      /\bvypinac\s*c5b\b/.test(text) ||
      /\bcislo\s*5\s*b\b/.test(text) ||
      /\b5b\b/.test(text) && text.includes("vypinac"),
    attributes: () => ({ switchType: "5B" }),
  },
  {
    topSlug: "vypinace-a-ovladace",
    childSlug: "vypinac-c1",
    confidence: 0.93,
    productType: "switch_1",
    test: ({ text }) =>
      /\bvypinac\s*(c|cislo|no\.?)?\s*1\b/.test(text) ||
      /\bvypinac\s*c1\b/.test(text) ||
      (text.includes("vypinac") && /\bc\s*1\b/.test(text) && !text.includes("c10")),
    attributes: () => ({ switchType: "1" }),
  },
  {
    topSlug: "vypinace-a-ovladace",
    childSlug: "vypinac-c6",
    confidence: 0.93,
    productType: "switch_6",
    test: ({ text }) =>
      /\bvypinac\s*(c|cislo)?\s*6\b/.test(text) || /\bvypinac\s*c6\b/.test(text),
    attributes: () => ({ switchType: "6" }),
  },
  {
    topSlug: "vypinace-a-ovladace",
    childSlug: "vypinac-c7",
    confidence: 0.93,
    productType: "switch_7",
    test: ({ text }) =>
      /\bvypinac\s*(c|cislo)?\s*7\b/.test(text) || /\bvypinac\s*c7\b/.test(text),
    attributes: () => ({ switchType: "7" }),
  },
  {
    topSlug: "vypinace-a-ovladace",
    childSlug: "vypinac-c5",
    confidence: 0.9,
    productType: "switch_5",
    test: ({ text }) =>
      (/\bvypinac\s*(c|cislo)?\s*5\b/.test(text) || /\bvypinac\s*c5\b/.test(text)) &&
      !/\b5\s*b\b/.test(text) &&
      !text.includes("c5b"),
    attributes: () => ({ switchType: "5" }),
  },
  {
    topSlug: "vypinace-a-ovladace",
    childSlug: "ramceky-a-kryty",
    confidence: 0.92,
    productType: "frame",
    test: ({ text, url }) =>
      any("ramcek", "ramceky", "kryt", "kryty", "slepá", "slepa")(text) ||
      url.includes("ramcek") ||
      url.includes("kryt"),
  },
  {
    topSlug: "vypinace-a-ovladace",
    childSlug: "tlacidla",
    confidence: 0.88,
    productType: "button",
    test: ({ text }) => any("tlacidlo", "tlacidla", "tlacítko", "tlacitko")(text),
  },
  {
    topSlug: "vypinace-a-ovladace",
    childSlug: "stmievace",
    confidence: 0.9,
    productType: "dimmer",
    test: ({ text }) => any("stmievace", "stmievac", "dimmer")(text),
  },
  {
    topSlug: "vypinace-a-ovladace",
    childSlug: "zaluziove-ovladace",
    confidence: 0.9,
    productType: "blind_control",
    test: ({ text }) => any("zaluz", "rolety", "zaluziov")(text),
  },
  {
    topSlug: "vypinace-a-ovladace",
    childSlug: "pohybove-snimace",
    confidence: 0.9,
    productType: "motion_sensor",
    test: ({ text }) => any("pohybovy", "pohybove", "pritomnost", "pir")(text),
  },
  {
    topSlug: "vypinace-a-ovladace",
    childSlug: "termostaty",
    confidence: 0.9,
    productType: "thermostat",
    test: ({ text }) => any("termostat")(text),
  },
  {
    topSlug: "vypinace-a-ovladace",
    childSlug: "ostatne-ovladace",
    confidence: 0.7,
    productType: "switch",
    test: ({ text, sourcePath }) =>
      any("vypinac", "ovladac")(text) || sourcePath.includes("vypinac"),
  },

  // Sockets
  {
    topSlug: "zasuvky-a-konektory",
    childSlug: "usb-nabijacky",
    confidence: 0.93,
    productType: "usb_charger",
    test: ({ text }) =>
      (any("usb")(text) && any("nabij", "charger", "zasuvka")(text)) ||
      (/\busb\b/.test(text) && text.includes("nabij")),
  },
  {
    topSlug: "zasuvky-a-konektory",
    childSlug: "dvojzasuvky",
    confidence: 0.9,
    productType: "double_socket",
    test: ({ text }) => any("dvojzasuvka", "dvojzasuvky", "2x zasuvka", "2 nasob")(text),
  },
  {
    topSlug: "zasuvky-a-konektory",
    childSlug: "zasuvky-ip44",
    confidence: 0.9,
    productType: "socket_ip",
    test: ({ text }) =>
      any("zasuvka", "zasuvky")(text) &&
      (/\bip\s?(44|54|55|65|67)\b/.test(text) || text.includes("vodotes")),
    attributes: ({ text }) => {
      const m = text.match(/ip\s?(44|54|55|65|67)/);
      return m ? { ipRating: `IP${m[1]}` } : {};
    },
  },
  {
    topSlug: "zasuvky-a-konektory",
    childSlug: "datove-zasuvky",
    confidence: 0.9,
    productType: "data_socket",
    test: ({ text }) =>
      any("datova zasuvka", "datove zasuvky", "rj45", "cat5", "cat6", "cat 6")(text),
  },
  {
    topSlug: "zasuvky-a-konektory",
    childSlug: "tv-sat-zasuvky",
    confidence: 0.9,
    productType: "tv_socket",
    test: ({ text }) =>
      (any("tv", "sat", "anten")(text) && any("zasuvka")(text)) ||
      text.includes("tv sat"),
  },
  {
    topSlug: "zasuvky-a-konektory",
    childSlug: "multimedialne-zasuvky",
    confidence: 0.85,
    productType: "media_socket",
    test: ({ text }) => any("repro", "hdmi", "multimedia")(text),
  },
  {
    topSlug: "zasuvky-a-konektory",
    childSlug: "kablove-vyvody",
    confidence: 0.85,
    productType: "cable_outlet",
    test: ({ text }) => any("kablovy vyvod", "kabelovy vyvod", "vyvod")(text),
  },
  {
    topSlug: "zasuvky-a-konektory",
    childSlug: "zaslepky",
    confidence: 0.88,
    productType: "blank",
    test: ({ text }) => any("zaslepka", "zaslepky")(text),
  },
  {
    topSlug: "zasuvky-a-konektory",
    childSlug: "zasuvky-230v",
    confidence: 0.8,
    productType: "socket_230v",
    test: ({ text, sourcePath }) =>
      any("zasuvka", "zasuvky", "230v", "230 v")(text) ||
      sourcePath.includes("zasuvk"),
  },

  // Protection
  {
    topSlug: "istice-a-ochranne-pristroje",
    childSlug: "afdd",
    confidence: 0.95,
    productType: "afdd",
    test: ({ text }) => any("afdd")(text),
  },
  {
    topSlug: "istice-a-ochranne-pristroje",
    childSlug: "kombinovane-chranice",
    confidence: 0.92,
    productType: "rcbo",
    test: ({ text }) =>
      any("kombinovany chranic", "kombinovane chranice", "rcbo")(text) ||
      (text.includes("istic") && text.includes("chranic")),
  },
  {
    topSlug: "istice-a-ochranne-pristroje",
    childSlug: "prudove-chranice",
    confidence: 0.93,
    productType: "rcd",
    test: ({ text }) =>
      any("prudovy chranic", "prudove chranice", "chranic", "rcd")(text) &&
      !text.includes("kombinovan"),
  },
  {
    topSlug: "istice-a-ochranne-pristroje",
    childSlug: "zvodice-prepatia",
    confidence: 0.92,
    productType: "spd",
    test: ({ text }) => any("zvodic", "prepät", "prepatia", "spd", "svod")(text),
  },
  {
    topSlug: "istice-a-ochranne-pristroje",
    childSlug: "poistkove-odpinace",
    confidence: 0.9,
    productType: "fuse_switch",
    test: ({ text }) => any("poistkovy odpinac", "odpinac")(text),
  },
  {
    topSlug: "istice-a-ochranne-pristroje",
    childSlug: "poistky",
    confidence: 0.88,
    productType: "fuse",
    test: ({ text }) => any("poistka", "poistky", "tavna")(text),
  },
  {
    topSlug: "istice-a-ochranne-pristroje",
    childSlug: "istice",
    confidence: 0.88,
    productType: "mcb",
    test: ({ text, sourcePath }) =>
      any("istic", "istice", "istič")(text) || sourcePath.includes("istic"),
  },

  // Panel devices
  {
    topSlug: "pristroje-pre-rozvadzace",
    childSlug: "stykace",
    confidence: 0.92,
    productType: "contactor",
    test: ({ text }) => any("stykac", "stykač", "contactor")(text),
  },
  {
    topSlug: "pristroje-pre-rozvadzace",
    childSlug: "casove-rele",
    confidence: 0.9,
    productType: "timer_relay",
    test: ({ text }) => any("casove rele", "časové relé", "casovac")(text),
  },
  {
    topSlug: "pristroje-pre-rozvadzace",
    childSlug: "rele",
    confidence: 0.85,
    productType: "relay",
    test: ({ text }) => any("rele", "relé")(text),
  },

  // Boards
  {
    topSlug: "rozvodnice-a-skrine",
    childSlug: "rozvodnice",
    confidence: 0.92,
    productType: "distribution_board",
    test: ({ text, sourcePath }) =>
      any("rozvodnica", "rozvodnice")(text) || sourcePath.includes("rozvodnic"),
  },
  {
    topSlug: "rozvodnice-a-skrine",
    childSlug: "skrine",
    confidence: 0.85,
    productType: "enclosure",
    test: ({ text }) => any("skrina", "skrine", "rozvádzač", "rozvadzac")(text),
  },

  // Cables
  {
    topSlug: "kable-a-vodice",
    childSlug: "datove-kable",
    confidence: 0.9,
    productType: "data_cable",
    test: ({ text }) =>
      any("datovy kabel", "datove kabel", "utp", "ftp", "cat5", "cat6", "patch kabel")(
        text
      ),
  },
  {
    topSlug: "kable-a-vodice",
    childSlug: "solarne-kable",
    confidence: 0.9,
    productType: "pv_cable",
    test: ({ text }) => any("solarny kabel", "pv kabel", "h1z2z2")(text),
  },
  {
    topSlug: "kable-a-vodice",
    childSlug: "instalacne-kable",
    confidence: 0.9,
    productType: "installation_cable",
    test: ({ text, sourcePath }) =>
      any("cyky", "nky", "ayd", "kabel", "vodic", "vodič")(text) ||
      sourcePath.includes("kabel") ||
      sourcePath.includes("vodic"),
  },

  // Boxes
  {
    topSlug: "instalacne-krabice",
    childSlug: "krabice-do-omietky",
    confidence: 0.85,
    productType: "box_flush",
    test: ({ text, sourcePath }) =>
      any("krabica", "krabice")(text) || sourcePath.includes("krabic"),
  },

  // Conduit / trunking
  {
    topSlug: "rurky-listy-a-kablove-trasy",
    childSlug: "zlaby",
    confidence: 0.88,
    productType: "cable_tray",
    test: ({ text }) => any("zlab", "žľab", "cable tray")(text),
  },
  {
    topSlug: "rurky-listy-a-kablove-trasy",
    childSlug: "listy",
    confidence: 0.88,
    productType: "trunking",
    test: ({ text }) => any("lista", "lišta", "kabelova lista")(text),
  },
  {
    topSlug: "rurky-listy-a-kablove-trasy",
    childSlug: "rurky",
    confidence: 0.88,
    productType: "conduit",
    test: ({ text, sourcePath }) =>
      any("rurka", "rúrka", "husienka", "kopoflex")(text) ||
      sourcePath.includes("rurk"),
  },

  // Terminals
  {
    topSlug: "svorky-a-spojovaci-material",
    childSlug: "wago-svorky",
    confidence: 0.93,
    productType: "wago",
    test: ({ text }) => any("wago")(text),
  },
  {
    topSlug: "svorky-a-spojovaci-material",
    childSlug: "radove-svorky",
    confidence: 0.88,
    productType: "terminal",
    test: ({ text }) => any("svorka", "svorky", "svorkovnica")(text),
  },

  // Lighting
  {
    topSlug: "osvetlenie",
    childSlug: "svietidla",
    confidence: 0.85,
    productType: "luminaire",
    test: ({ text, sourcePath }) =>
      any("svietidlo", "svietidla", "lampa", "zarovka", "led panel")(text) ||
      sourcePath.includes("sviet"),
  },

  // Structured cabling
  {
    topSlug: "strukturovana-kabelaz",
    childSlug: "moduly-keystone",
    confidence: 0.9,
    productType: "keystone",
    test: ({ text }) => any("keystone")(text),
  },
  {
    topSlug: "strukturovana-kabelaz",
    childSlug: "patch-panely",
    confidence: 0.9,
    productType: "patch_panel",
    test: ({ text }) => any("patch panel", "patchpanel")(text),
  },

  // Earthing / lightning
  {
    topSlug: "uzemnenie-a-bleskozvody",
    childSlug: "bleskozvodny-material",
    confidence: 0.95,
    productType: "lightning",
    test: ({ text, sourcePath }) =>
      any("bleskozvod", "zachytavac", "fangfix")(text) ||
      sourcePath.includes("bleskozvod"),
  },
  {
    topSlug: "uzemnenie-a-bleskozvody",
    childSlug: "uzemnovacie-tyce",
    confidence: 0.9,
    productType: "earth_rod",
    test: ({ text }) => any("uzemnovac", "uzemnenie", "uzemň")(text),
  },
  {
    topSlug: "uzemnenie-a-bleskozvody",
    childSlug: "uzemnovacie-svorky",
    confidence: 0.85,
    productType: "earth_clamp",
    test: ({ text, sourcePath }) =>
      sourcePath.includes("bleskozvod") && any("svorka")(text),
  },

  // Industrial
  {
    topSlug: "priemyselne-zasuvky-a-vidlice",
    childSlug: "cee-zasuvky",
    confidence: 0.9,
    productType: "cee_socket",
    test: ({ text }) => any("cee", "priemyselna zasuvka", "16a 400v", "32a")(text),
  },

  // PV / EV
  {
    topSlug: "fotovoltika",
    childSlug: "pv-prislusenstvo",
    confidence: 0.9,
    productType: "pv",
    test: ({ text, sourcePath }) =>
      any("fotovolt", "solar", "pv ")(text) || sourcePath.includes("fotovolt"),
  },
  {
    topSlug: "elektromobilita",
    childSlug: "wallboxy",
    confidence: 0.92,
    productType: "ev_charger",
    test: ({ text }) => any("wallbox", "elektromobil", "ev charger", "nabijacka ev")(text),
  },

  // HVAC electrical
  {
    topSlug: "vykurovanie-a-ventilacia",
    childSlug: "elektricke-kurene",
    confidence: 0.85,
    productType: "heating",
    test: ({ text }) => any("vykurov", "kurene", "topny kabel", "konvektor")(text),
  },
  {
    topSlug: "vykurovanie-a-ventilacia",
    childSlug: "ventilatory",
    confidence: 0.85,
    productType: "fan",
    test: ({ text }) => any("ventilator", "ventilátor")(text),
  },

  // Tools
  {
    topSlug: "naradie-a-pracovne-pomocky",
    childSlug: "meracie-naradie",
    confidence: 0.85,
    productType: "tool",
    test: ({ text, sourcePath }) =>
      any("multimeter", "skusacka", "meraci")(text) || sourcePath.includes("narad"),
  },
];

export function classifyElectricalProduct(input: {
  name: string;
  url: string;
  sourceCategoryPath?: string;
  sourceCategoryName?: string;
}): ClassificationHit {
  const text = normalizeCatalogName(
    [input.name, input.sourceCategoryName, input.sourceCategoryPath, input.url]
      .filter(Boolean)
      .join(" ")
  );
  const url = normalizeCatalogName(input.url);
  const sourcePath = normalizeCatalogName(input.sourceCategoryPath ?? "");

  for (const rule of RULES) {
    if (rule.test({ text, url, sourcePath })) {
      return {
        topSlug: rule.topSlug,
        childSlug: rule.childSlug,
        confidence: rule.confidence,
        productType: rule.productType ?? null,
        attributes: rule.attributes?.({ text }) ?? {},
        unmatched: false,
      };
    }
  }

  return {
    topSlug: "ostatne-elektro",
    childSlug: "neklasifikovane",
    confidence: 0.2,
    productType: null,
    attributes: {},
    unmatched: true,
  };
}

export function listElectricalCategoryDefs(): ElectricalCategoryDef[] {
  return ELECTRICAL_CATEGORY_TREE;
}

export function resolveCategoryNames(topSlug: string, childSlug: string | null): {
  topName: string;
  childName: string | null;
} {
  const top = ELECTRICAL_CATEGORY_TREE.find((c) => c.slug === topSlug);
  if (!top) {
    return { topName: slugifyCatalog(topSlug), childName: childSlug };
  }
  const child = childSlug
    ? top.children?.find((c) => c.slug === childSlug)?.name ?? null
    : null;
  return { topName: top.name, childName: child };
}
