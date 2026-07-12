/**
 * Build product search intents from estimator material rows / takeoff titles.
 */

import type { ProductCategory, ProductSearchIntent } from "./productSourcingTypes";

function detectCategory(title: string): ProductCategory {
  const t = title.toLowerCase();
  if (/zásuv|zasuv|socket|steck|el\.?\s*zásuv/i.test(t)) return "socket";
  if (/vypína|vypina|switch|schalter|stmieva|spínač/i.test(t)) return "switch";
  if (/led\s*pás|led\s*pas|led.?strip/i.test(t)) return "led_strip";
  if (/profil|lišta|lista|rail|track/i.test(t)) return "led_profile";
  if (/driver|zdroj|napája/i.test(t)) return "led_driver";
  if (/svietidl|osvetlen|pendant|ceiling|wall\s*light|podsviet/i.test(t)) return "light_fixture";
  if (/krabica|box|chránič|chranic/i.test(t)) return "installation_box";
  if (/kábel|kabel|cyky|nym|trasa|cable/i.test(t)) return "cable";
  if (/rúra|rura|conduit|chráničk/i.test(t)) return "conduit";
  if (/rozvád|rozvad|verteiler|distribution|istien/i.test(t)) return "distribution_board";
  if (/svork|terminal|upevň|montážny/i.test(t)) return "mounting_material";
  return "other";
}

function keywordsFor(title: string, category: ProductCategory): string[] {
  const base = title
    .toLowerCase()
    .replace(/[()]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 2)
    .slice(0, 8);
  const extras: Record<ProductCategory, string[]> = {
    socket: ["zásuvka", "socket", "230v"],
    switch: ["vypínač", "switch"],
    cable: ["kábel", "cyky", "cable"],
    conduit: ["chránička", "conduit"],
    installation_box: ["krabica", "box"],
    led_strip: ["led", "pás", "24v"],
    led_profile: ["profil", "difúzor", "lišta"],
    led_driver: ["driver", "zdroj", "24v"],
    light_fixture: ["svietidlo", "osvetlenie"],
    distribution_board: ["rozvádzač", "istič"],
    breaker: ["istič", "breaker"],
    terminal: ["svorka"],
    mounting_material: ["montáž", "upevnenie"],
    other: [],
  };
  return [...new Set([...base, ...extras[category]])];
}

export type MaterialLike = {
  id: string;
  name: string;
  qty: number;
  unit: string;
  included?: boolean;
};

export function buildProductSearchIntents(materials: MaterialLike[]): ProductSearchIntent[] {
  const intents: ProductSearchIntent[] = [];

  for (const m of materials) {
    if (m.included === false || !m.name.trim()) continue;
    const category = detectCategory(m.name);
    const qty = m.qty > 0 ? m.qty : 0;
    const unit = (m.unit || "ks").toLowerCase().includes("m") ? "m" : "ks";

    const needsReviewReasons: string[] = [];
    if (qty <= 0) needsReviewReasons.push("Chýba množstvo vo výkaze.");
    if (category === "cable") {
      needsReviewReasons.push("Typ a dĺžka kábla musia byť potvrdené (nezmýšľať z pôdorysu).");
    }
    if (category === "led_strip" || category === "led_profile") {
      needsReviewReasons.push("Overiť CCT, napätie, IP a W/m.");
    }
    if (category === "distribution_board") {
      needsReviewReasons.push("Špecifikácia rozvádzača / ističov nie je z legendy spoľahlivá.");
    }

    const intent: ProductSearchIntent = {
      takeoffItemId: m.id,
      title: m.name.trim(),
      category,
      quantity: qty,
      unit,
      keywords: keywordsFor(m.name, category),
      needsReviewReasons,
    };

    // LED systems need companions (profile + driver) when strip is the main line.
    if (category === "led_strip") {
      intent.companionIntents = [
        {
          takeoffItemId: `${m.id}__profile`,
          title: `LED profil + difúzor (k: ${m.name.trim()})`,
          category: "led_profile",
          quantity: qty,
          unit: "m",
          keywords: ["led", "profil", "difúzor"],
          needsReviewReasons: ["Typ profilu overiť podľa SDK / lišty."],
        },
        {
          takeoffItemId: `${m.id}__driver`,
          title: `LED zdroj / driver (k: ${m.name.trim()})`,
          category: "led_driver",
          quantity: 1,
          unit: "ks",
          keywords: ["led", "driver", "zdroj", "24v"],
          needsReviewReasons: ["Výkon zdroja treba dopočítať podľa W/m × dĺžka."],
        },
      ];
    }

    intents.push(intent);
  }

  return intents;
}
