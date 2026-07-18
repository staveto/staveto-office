/**
 * Quote generation from confirmed drawing occurrences.
 *
 * Confirmed occurrences of the same trade+type are grouped into one quote
 * line (quantity = count). Assembly rules optionally expand each group into
 * rule_derived supporting lines (needs_review, no invented prices).
 *
 * Persisted by mapping onto the existing projects/{id}/quoteItems draft
 * model, so the manual quote editor keeps full control: quantities, prices
 * and notes remain editable and manually added items are never touched.
 */

import type {
  DrawingOccurrence,
  TakeoffQuoteLine,
} from "@/types/drawingTakeoff";
import { assemblyRuleFor } from "./assemblyRules";
import { defaultUnitFor } from "./drawingTakeoff";

export type QuoteGenerationOptions = {
  /** Expand assembly rules into rule_derived component lines. */
  expandAssemblies?: boolean;
  /** Translate an i18n key (assembly component names). Defaults to identity. */
  translate?: (key: string) => string;
};

/** Occurrences eligible to become quote lines. */
export function confirmedOccurrences(
  occurrences: DrawingOccurrence[]
): DrawingOccurrence[] {
  return occurrences.filter(
    (o) => o.status === "confirmed" || o.status === "used_in_quote"
  );
}

/**
 * Build quote lines from confirmed occurrences. Grouping key is
 * trade+type+label so differently labelled marks stay separate rows.
 */
export function buildQuoteLinesFromOccurrences(
  occurrences: DrawingOccurrence[],
  options: QuoteGenerationOptions = {}
): TakeoffQuoteLine[] {
  const translate = options.translate ?? ((k: string) => k);
  const eligible = confirmedOccurrences(occurrences);
  const groups = new Map<string, DrawingOccurrence[]>();
  for (const o of eligible) {
    const key = `${o.trade}|${o.type}|${o.label}`;
    const list = groups.get(key) ?? [];
    list.push(o);
    groups.set(key, list);
  }

  const lines: TakeoffQuoteLine[] = [];
  for (const [key, group] of groups) {
    const first = group[0];
    const unit = defaultUnitFor(first.trade, first.type);
    const baseId = `takeoff_${key.replace(/[^a-z0-9]+/gi, "_")}`;
    lines.push({
      id: baseId,
      projectId: first.projectId,
      sourceOccurrenceIds: group.map((o) => o.id),
      name: first.label,
      trade: first.trade,
      category: "material",
      unit,
      quantity: group.length,
      source: "drawing_detection",
      sourceOfQuantity: "symbol_detection",
      evidenceCount: group.length,
      status: "draft",
    });

    if (options.expandAssemblies) {
      const rule = assemblyRuleFor(first.trade, first.type);
      if (rule) {
        rule.components.forEach((component, idx) => {
          lines.push({
            id: `${baseId}_c${idx}`,
            projectId: first.projectId,
            sourceOccurrenceIds: group.map((o) => o.id),
            name: translate(component.nameKey),
            trade: first.trade,
            category: component.category,
            unit: component.unit,
            quantity: Number((component.qtyPerUnit * group.length).toFixed(2)),
            source: "rule_derived",
            status: "needs_review",
          });
        });
      }
    }
  }
  return lines;
}

/**
 * Merge generated lines with existing quote draft items WITHOUT touching
 * manual items. Returns only the new lines that don't already exist
 * (matched by name + unit) — the caller persists them additively.
 */
export function newLinesAgainstExisting(
  generated: TakeoffQuoteLine[],
  existing: Array<{ name: string; unit: string }>
): TakeoffQuoteLine[] {
  const existingKeys = new Set(
    existing.map((e) => `${e.name.trim().toLowerCase()}|${e.unit.trim().toLowerCase()}`)
  );
  return generated.filter(
    (l) => !existingKeys.has(`${l.name.trim().toLowerCase()}|${l.unit.trim().toLowerCase()}`)
  );
}
