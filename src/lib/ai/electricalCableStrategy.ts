/**
 * Cable strategy — never invent exact metres from point symbols alone.
 */

import type { InternalTakeoffRow } from "./electricalQuoteTypes";

export type CableEstimateSettings = {
  /** Allow preliminary allowance rows (still needsReview). Default false. */
  allowPreliminaryAllowance?: boolean;
  defaultReservePercent?: number;
  defaultCableTypes?: {
    lighting?: string;
    sockets?: string;
    led?: string;
    data?: string;
  };
};

export type CableStrategyResult = {
  rows: InternalTakeoffRow[];
  assumptions: string[];
};

export function buildCableStrategy(params: {
  takeoff: InternalTakeoffRow[];
  settings?: CableEstimateSettings;
}): CableStrategyResult {
  const rows: InternalTakeoffRow[] = [];
  const assumptions: string[] = [];
  const existing = params.takeoff;

  const hasMeasuredCable = existing.some(
    (r) =>
      r.category === "cable" &&
      typeof r.quantity === "number" &&
      r.quantity > 0 &&
      !r.needsReview &&
      r.source !== "assumption"
  );

  if (hasMeasuredCable) {
    assumptions.push("Kabeláž obsahuje zamerané / zdokumentované dĺžky — overte jednotky a typy.");
    return { rows, assumptions };
  }

  const hasAnyCableRow = existing.some((r) => r.category === "cable");
  if (!hasAnyCableRow) {
    rows.push({
      id: "cable_measure_required",
      title: "Dĺžky káblových trás treba zamerať alebo potvrdiť",
      category: "cable",
      unit: "m",
      source: "assumption",
      confidence: "low",
      needsReview: true,
      reviewReason:
        "Zo značiek na pôdoryse nie je spoľahlivé odvodiť metre trás. Zameranie alebo potvrdenie je povinné pred pevnou cenou.",
      included: true,
    });
  }

  const types = params.settings?.defaultCableTypes ?? {};
  const categories = [
    { id: "lighting", title: "Kabeláž svetelných obvodov", hint: types.lighting ?? "typ podľa projektu (napr. CYKY)" },
    { id: "sockets", title: "Kabeláž zásuvkových obvodov", hint: types.sockets ?? "typ podľa projektu (napr. CYKY)" },
    { id: "led", title: "LED napájanie / ovládanie", hint: types.led ?? "podľa výrobcu LED" },
    { id: "data", title: "Slaboprúd / dátové trasy", hint: types.data ?? "UTP / podľa projektu" },
  ] as const;

  for (const c of categories) {
    rows.push({
      id: `cable_cat_${c.id}`,
      title: `${c.title} (${c.hint})`,
      category: "cable",
      unit: "m",
      source: "assumption",
      confidence: "low",
      needsReview: true,
      reviewReason: "Kategória kabeláže bez zameranej dĺžky — doplňte metre alebo vyraďte z pevnej ceny.",
      included: true,
    });
  }

  const reserve = params.settings?.defaultReservePercent ?? 10;
  assumptions.push(
    `Rezerva kabeláže ${reserve} % sa uplatní až po zameraní trás (nie ako fiktívna dĺžka zo značiek).`
  );

  if (params.settings?.allowPreliminaryAllowance) {
    assumptions.push(
      "Predbežný odhad káblov je povolený firemným nastavením — stále označený ako predpoklad (needsReview)."
    );
  } else {
    assumptions.push(
      "Presné metre káblov nie sú inventované. Ponuka používa stratégiu kabeláže + otvorený bod na zameranie."
    );
  }

  return { rows, assumptions };
}
