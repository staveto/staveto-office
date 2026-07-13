/**
 * Estimator knowledge context builder — compact prompt context for Gemini.
 *
 * Never sends the whole knowledge database: only the relevant symbols/aliases,
 * assembly titles and labor hints for the requested country + trade, hard-capped
 * in size. Pure formatting lives here so it is testable; a functions-side twin
 * (functions/src/estimator/knowledgeContext.ts) reads Firestore with admin.
 */

import type {
  CustomSymbolMapping,
  KnowledgeAssemblyTemplate,
  KnowledgeContext,
  KnowledgeSymbolEntry,
  LaborRule,
} from "@/types/estimatorKnowledge";
import {
  getAssemblyTemplates,
  getCustomSymbolMappings,
  getLaborRules,
  getSymbolEntries,
} from "./knowledgeRepository";

const MAX_SYMBOLS = 40;
const MAX_ALIASES_PER_SYMBOL = 6;
const MAX_ASSEMBLIES = 20;
const MAX_LABOR_RULES = 12;
const MAX_MAPPINGS = 30;
const MAX_CONTEXT_CHARS = 4000;

export function formatKnowledgeContext(input: {
  symbols: KnowledgeSymbolEntry[];
  assemblies: KnowledgeAssemblyTemplate[];
  laborRules: LaborRule[];
  customMappings: CustomSymbolMapping[];
}): string {
  const lines: string[] = [];

  if (input.symbols.length > 0) {
    lines.push("KNOWN SYMBOL ALIASES (country/trade specific — map matching text to normalizedPoint):");
    for (const s of input.symbols.slice(0, MAX_SYMBOLS)) {
      const aliases = s.aliases.slice(0, MAX_ALIASES_PER_SYMBOL).join(" | ");
      lines.push(`- ${s.normalizedPoint}: ${aliases}`);
    }
  }

  if (input.customMappings.length > 0) {
    lines.push(
      "COMPANY-CONFIRMED MAPPINGS (highest priority after project legend — never override with a guess):"
    );
    for (const m of input.customMappings.slice(0, MAX_MAPPINGS)) {
      lines.push(`- "${m.detectedText}" => ${m.normalizedPoint}`);
    }
  }

  if (input.assemblies.length > 0) {
    lines.push("ASSEMBLY CONCEPTS (a symbol is a technical point, not a product):");
    for (const a of input.assemblies.slice(0, MAX_ASSEMBLIES)) {
      const mats = a.materialComponents
        .slice(0, 4)
        .map((m) => m.category)
        .join(", ");
      lines.push(`- ${a.normalizedPoint} → ${a.title} [${mats}]`);
    }
  }

  if (input.laborRules.length > 0) {
    lines.push("LABOR HINTS (minutes per unit — do not invent different productivity):");
    for (const r of input.laborRules.slice(0, MAX_LABOR_RULES)) {
      lines.push(`- ${r.category}: ~${r.defaultMinutesPerUnit} min/unit`);
    }
  }

  const text = lines.join("\n");
  return text.length > MAX_CONTEXT_CHARS ? text.slice(0, MAX_CONTEXT_CHARS) : text;
}

/** Load + format the compact knowledge context for a Gemini call. */
export async function buildEstimatorKnowledgeContext(
  ctx: KnowledgeContext
): Promise<string> {
  const [symbols, assemblies, laborRules, customMappings] = await Promise.all([
    getSymbolEntries(ctx),
    getAssemblyTemplates(ctx),
    getLaborRules(ctx),
    ctx.orgId
      ? getCustomSymbolMappings(ctx.orgId, ctx.trade, ctx.countryCode)
      : Promise.resolve([]),
  ]);
  return formatKnowledgeContext({ symbols, assemblies, laborRules, customMappings });
}
