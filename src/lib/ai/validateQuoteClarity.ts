/**
 * Customer quote clarity validation — block send when not professional.
 */

import type { QuotePackage } from "./electricalQuoteTypes";

export type QuoteClarityResult = {
  ok: boolean;
  errors: string[];
  warnings: string[];
};

const ENGLISH_FRAGMENT =
  /\b(Electrical marking|Job archetype|from_document|needsReview|Includes legend|origin=|confidence=|inputSummary|This drawing|PDF contains)\b/i;

export function validateQuoteClarity(params: {
  quote: QuotePackage;
  language?: "sk" | "de" | "en";
  rawCustomerRowCount?: number;
  materialTotal?: number;
  laborIsGenericOnly?: boolean;
  documentMentionsSockets?: boolean;
  hasSocketLines?: boolean;
  documentMentionsSwitches?: boolean;
  hasSwitchLines?: boolean;
  hasCableStrategy?: boolean;
  distributionBoardClear?: boolean;
  testingClear?: boolean;
  claimsCompleteInstall?: boolean;
  excludesFixtureInstall?: boolean;
}): QuoteClarityResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  const q = params.quote;
  const lang = params.language ?? q.language;

  if ((params.materialTotal ?? 0) <= 0) {
    errors.push("Materiál má celkovú cenu 0 €, hoci materiál je v rozsahu — doplňte cenník alebo označte dodávku zákazníkom.");
  }

  if (params.laborIsGenericOnly) {
    errors.push("Práca je len jedna generická položka (napr. 16 h). Použite členenie podľa kategórií.");
  }

  if (params.documentMentionsSockets && !params.hasSocketLines) {
    errors.push("Vo výkrese sú zásuvky, ale v ponuke chýbajú.");
  }
  if (params.documentMentionsSwitches && !params.hasSwitchLines) {
    errors.push("Vo výkrese sú vypínače / svetlá bez spoľahlivého ovládania v ponuke.");
  }
  if (!params.hasCableStrategy) {
    errors.push("Chýba stratégia kabeláže (zameranie / predpoklad).");
  }
  if (params.distributionBoardClear === false) {
    errors.push("Rozsah rozvádzača nie je jasný.");
  }
  if (params.testingClear === false) {
    warnings.push("Skúšky / revízia nie sú jednoznačne vyriešené.");
  }

  if (params.claimsCompleteInstall && params.excludesFixtureInstall) {
    errors.push(
      "Rozpor: ponuka tvrdí kompletnú inštaláciu, ale montáž svietidiel je vylúčená bez jasného vysvetlenia."
    );
  }

  if ((params.rawCustomerRowCount ?? 0) > 20) {
    errors.push(
      "Zákaznícka tabuľka má príliš veľa nesprávne zoskupených riadkov (>20). Použite QuotePackage sekcie, nie surový výkaz."
    );
  }

  const textBlob = [
    q.intro,
    q.scopeSummary,
    ...q.assumptions,
    ...q.exclusions,
    ...q.openPoints,
    ...q.sections.flatMap((s) => s.lines.map((l) => l.title)),
  ].join("\n");

  if (lang === "sk" && ENGLISH_FRAGMENT.test(textBlob)) {
    errors.push("V slovenskej ponuke sú anglické / interné AI fragmenty — odstráňte ich pred odoslaním.");
  }

  if (q.status === "draft" || q.blockedReasons.length > 0) {
    errors.push(
      `Ponuka ešte nie je pripravená na odoslanie. Chýba: ${
        q.blockedReasons.slice(0, 3).join(" ") || "doplnenie výkazu / cien"
      }`
    );
  }

  if (q.status === "preliminary") {
    warnings.push("Ponuka je predbežná (chýbajú ceny).");
  }

  return {
    ok: errors.length === 0,
    errors: [...new Set(errors)],
    warnings: [...new Set(warnings)],
  };
}
