/**
 * Electrical estimator quality gate — never silently ignore missing categories.
 */

import type {
  CompletenessFinding,
  ElectricalCompletenessCategory,
  InternalTakeoffRow,
} from "./electricalQuoteTypes";
import { matchStarterSymbol } from "./electricalSymbolLibrary";

export type ElectricalQualityGateInput = {
  takeoff: InternalTakeoffRow[];
  /** Raw OCR / selectable PDF text snippets (optional). */
  documentTextHints?: string[];
  /** Legend descriptions from drawing. */
  legendTexts?: string[];
  language?: "sk" | "de" | "en";
};

function hasCategory(
  rows: InternalTakeoffRow[],
  pred: (r: InternalTakeoffRow) => boolean
): boolean {
  return rows.some((r) => r.included !== false && pred(r));
}

function textHintsMention(hints: string[], patterns: RegExp[]): boolean {
  const blob = hints.join("\n");
  return patterns.some((p) => p.test(blob));
}

function qtySum(rows: InternalTakeoffRow[], pred: (r: InternalTakeoffRow) => boolean): number {
  return rows
    .filter((r) => r.included !== false && pred(r))
    .reduce((s, r) => s + (typeof r.quantity === "number" && r.quantity > 0 ? r.quantity : 0), 0);
}

/**
 * Validate whether an electrical estimate is commercially complete enough.
 */
export function validateElectricalEstimateCompleteness(
  input: ElectricalQualityGateInput
): CompletenessFinding[] {
  const rows = input.takeoff ?? [];
  const hints = [
    ...(input.documentTextHints ?? []),
    ...(input.legendTexts ?? []),
    ...rows.map((r) => `${r.title} ${r.symbolLabel ?? ""}`),
  ];

  const findings: CompletenessFinding[] = [];

  const add = (f: CompletenessFinding) => findings.push(f);

  // lighting
  {
    const present = hasCategory(rows, (r) => r.category === "lighting");
    const hinted = textHintsMention(hints, [/svietidl|osvetlen|pendant|ceiling|wall\s*light/i]);
    if (present) {
      add({
        category: "lighting_points",
        status: qtySum(rows, (r) => r.category === "lighting") > 0 ? "present" : "needs_review",
        messageSk: "Svetelné body sú vo výkaze.",
        blocksFixedQuote: false,
      });
    } else if (hinted) {
      add({
        category: "lighting_points",
        status: "missing",
        messageSk:
          "Vo výkrese sú viditeľné svetelné body, ale výkaz osvetlenia nie je kompletný. Skontrolujte výkres alebo pridajte výrezy.",
        blocksFixedQuote: true,
      });
    } else {
      add({
        category: "lighting_points",
        status: "needs_review",
        messageSk: "Osvetlenie nebolo spoľahlivo identifikované — overte legendu a pôdorys.",
        blocksFixedQuote: false,
      });
    }
  }

  // LED
  {
    const present = hasCategory(rows, (r) => r.category === "led_strip");
    const hinted = textHintsMention(hints, [/led\s*pás|led\s*pas|led\s*strip|sveteln[aá]\s*lišt/i]);
    add({
      category: "led_strips",
      status: present ? "present" : hinted ? "missing" : "needs_review",
      messageSk: present
        ? "LED položky sú vo výkaze."
        : hinted
          ? "Vo výkrese sú LED pásy/lišty, ale dĺžky alebo položky chýbajú. Overte kóty a legendu."
          : "LED systémy neboli identifikované.",
      blocksFixedQuote: Boolean(hinted && !present),
    });
  }

  // sockets
  {
    const present = hasCategory(rows, (r) => r.category === "socket");
    const hinted = textHintsMention(hints, [
      /el\.?\s*zásuv|zásuvk|zasuvk|steckdose|socket|schuko|dvojzásuv/i,
    ]);
    // Also try starter dictionary on hints
    const dictHit = hints.some((h) => {
      const m = matchStarterSymbol(h);
      return m?.normalizedType === "socket" || m?.normalizedType === "double_socket";
    });
    const seen = hinted || dictHit;
    add({
      category: "sockets",
      status: present ? "present" : seen ? "missing" : "needs_review",
      messageSk: present
        ? "Zásuvky sú vo výkaze."
        : seen
          ? "Vo výkrese sú viditeľné zásuvky (napr. EL.zásuvka), ale výkaz zásuviek nie je kompletný. Skontrolujte výkres alebo pridajte výrezy."
          : "Zásuvky neboli spoľahlivo vyčítané — pridajte ich alebo potvrďte, že nie sú v rozsahu.",
      blocksFixedQuote: Boolean(seen && !present),
    });
  }

  // switches
  {
    const present = hasCategory(rows, (r) => r.category === "switch");
    const lightingPresent = hasCategory(rows, (r) => r.category === "lighting" || r.category === "led_strip");
    const hinted = textHintsMention(hints, [/vypínač|vypinac|spínač|schalter|switch|stmieva/i]);
    if (present) {
      add({
        category: "switches",
        status: "present",
        messageSk: "Vypínače / ovládanie sú vo výkaze.",
        blocksFixedQuote: false,
      });
    } else if (hinted || lightingPresent) {
      add({
        category: "switches",
        status: "missing",
        messageSk: lightingPresent
          ? "Vo výkrese sú svetelné body, ale ovládacie prvky/vypínače neboli spoľahlivo vyčítané."
          : "Vo výkrese sú vypínače, ale výkaz ich neobsahuje kompletne.",
        blocksFixedQuote: true,
      });
    } else {
      add({
        category: "switches",
        status: "needs_review",
        messageSk: "Vypínače neboli identifikované — overte legendu.",
        blocksFixedQuote: false,
      });
    }
  }

  // cabling
  {
    const present = hasCategory(
      rows,
      (r) =>
        r.category === "cable" ||
        /kábel|kabel|cyky|cable|trasa/i.test(r.title)
    );
    add({
      category: "cable_routes_or_cabling_assumption",
      status: present ? (rows.some((r) => r.category === "cable" && r.needsReview) ? "needs_review" : "present") : "missing",
      messageSk: present
        ? "Kabeláž je vo výkaze (overte, či ide o predpoklad alebo zamerané metre)."
        : "Chýba stratégia kabeláže. Dĺžky trás treba zamerať alebo potvrdiť — nevymýšľajte metre zo značiek.",
      blocksFixedQuote: !present,
    });
  }

  // boxes
  {
    const present = hasCategory(
      rows,
      (r) =>
        r.category === "installation_material" ||
        /krabica|krabice|chránič|chranic|konduit|conduit/i.test(r.title)
    );
    add({
      category: "installation_boxes",
      status: present ? "present" : "missing",
      messageSk: present
        ? "Krabice / montážny materiál sú vo výkaze."
        : "Chýbajú inštalačné krabice / chráničky / montážny materiál — doplňte alebo označte ako mimo rozsahu.",
      blocksFixedQuote: !present,
    });
  }

  // chasing
  {
    const present = hasCategory(
      rows,
      (r) => /dráž|draz|sekan|chasing|schlitz|prestup/i.test(r.title)
    );
    add({
      category: "wall_chasing_or_surface_mounting_assumption",
      status: present ? "present" : "missing",
      messageSk: present
        ? "Drážkovanie / príprava trás je vo výkaze."
        : "Chýba drážkovanie / povrchová montáž — doplňte rozsah alebo otvorený bod na obhliadku.",
      blocksFixedQuote: !present,
    });
  }

  // DB
  {
    const present = hasCategory(
      rows,
      (r) =>
        r.category === "distribution_board" ||
        /rozvádzač|rozvadzac|verteiler|distribution/i.test(r.title)
    );
    const excluded = rows.some((r) =>
      /rozvádzač.*mimo|nie je v rozsahu|not in scope.*board/i.test(`${r.title} ${r.reviewReason ?? ""}`)
    );
    add({
      category: "distribution_board_or_explicitly_not_in_scope",
      status: present ? "present" : excluded ? "explicitly_excluded" : "missing",
      messageSk: present
        ? "Rozvádzač je vo výkaze."
        : excluded
          ? "Rozvádzač je explicitne mimo rozsahu."
          : "Rozsah rozvádzača nie je jasný — doplňte osadenie/zapojenie alebo uveďte výluku.",
      blocksFixedQuote: !present && !excluded,
    });
  }

  // testing
  {
    const present = hasCategory(
      rows,
      (r) =>
        r.category === "testing" ||
        /skúšk|skusk|merania|commission|testovan|odovzdan/i.test(r.title)
    );
    add({
      category: "testing_commissioning",
      status: present ? "present" : "missing",
      messageSk: present
        ? "Skúšky / odovzdanie sú vo výkaze."
        : "Chýbajú skúšky, merania a odovzdanie — doplňte paušál alebo označte výluku.",
      blocksFixedQuote: !present,
    });
  }

  // revision
  {
    const present = hasCategory(rows, (r) => /revíz|reviz|protokol/i.test(r.title));
    const excluded = textHintsMention(hints, [/revíz.*mimo|bez revíz|revision not included/i]);
    add({
      category: "revision_or_explicitly_not_in_scope",
      status: present ? "present" : excluded ? "explicitly_excluded" : "needs_review",
      messageSk: present
        ? "Revízia / protokol je vo výkaze."
        : "Revízia nie je jednoznačne v rozsahu — potvrďte, či je zahrnutá alebo vo výluke.",
      blocksFixedQuote: false,
    });
  }

  // material supply
  {
    add({
      category: "material_supply_assumption",
      status: "needs_review",
      messageSk:
        "Potvrďte, či materiál dodáva firma alebo zákazník (svietidlá, LED zdroje, rozvádzač).",
      blocksFixedQuote: false,
    });
  }

  // customer fixtures
  {
    add({
      category: "customer_supplied_fixtures_assumption",
      status: "needs_review",
      messageSk:
        "Potvrďte, či svietidlá / LED pásy dodáva zákazník. Ak áno, uveďte to vo výlukách — vyhnite sa rozporu „kompletná inštalácia“ vs. bez montáže svietidiel.",
      blocksFixedQuote: false,
    });
  }

  return findings;
}

export function qualityGateBlocksFixedQuote(findings: CompletenessFinding[]): boolean {
  return findings.some((f) => f.blocksFixedQuote && f.status === "missing");
}

export function qualityGateOpenPoints(findings: CompletenessFinding[]): string[] {
  return findings
    .filter((f) => f.status === "missing" || f.status === "needs_review")
    .map((f) => f.messageSk);
}

export function categoriesPresent(
  findings: CompletenessFinding[]
): Set<ElectricalCompletenessCategory> {
  return new Set(
    findings.filter((f) => f.status === "present" || f.status === "explicitly_excluded").map((f) => f.category)
  );
}
