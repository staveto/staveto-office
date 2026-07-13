/**
 * Knowledge-backed symbol resolver — same priority as src/lib/ai/symbolResolver,
 * but the standard library and company mappings come from the knowledge backend
 * (Firestore with seed fallback) instead of hardcoded starter arrays.
 *
 * Priority: project legend → user-confirmed → company custom → licensed pack
 * → standard metadata aliases → AI inferred → unknown.
 */

import {
  resolveDrawingSymbol,
  type CompanySymbolMapping,
  type DrawingSymbolCandidate,
  type LegendLike,
  type ResolvedDrawingSymbol,
} from "@/lib/ai/symbolResolver";
import type { SymbolLibraryEntry } from "@/lib/ai/electricalSymbolLibrary";
import type {
  CustomSymbolMapping,
  KnowledgeContext,
  KnowledgeSymbolEntry,
} from "@/types/estimatorKnowledge";
import {
  getCustomSymbolMappings,
  getSymbolEntries,
} from "./knowledgeRepository";

/** Knowledge doc → resolver library entry. */
export function toLibraryEntry(e: KnowledgeSymbolEntry): SymbolLibraryEntry {
  return {
    id: e.id,
    trade: e.trade,
    countryCodes: e.countryCodes,
    countries: e.countryCodes,
    sourceType: e.sourceType,
    standardRef: e.standardRef,
    displayName: e.displayName,
    aliases: e.aliases,
    textPatterns: e.textPatterns.length ? e.textPatterns : e.aliases,
    // Legacy field not used by point-based resolution.
    normalizedType: "unknown",
    normalizedPoint: e.normalizedPoint,
    defaultUnit: e.defaultUnit,
    quoteGroup: "review_only",
    confidenceWeight: e.confidenceWeight,
    licenseStatus: e.licenseStatus,
  };
}

export function toCompanyMapping(m: CustomSymbolMapping): CompanySymbolMapping {
  return {
    pattern: m.detectedText,
    normalizedPoint: m.normalizedPoint,
    displayName: m.detectedText,
    sourceType: "user_confirmed",
  };
}

export type ResolveSymbolKnowledge = {
  standardLibrary: SymbolLibraryEntry[];
  userConfirmedMappings: CompanySymbolMapping[];
};

/** Load resolver inputs from the knowledge backend once per session/context. */
export async function loadResolveSymbolKnowledge(
  ctx: KnowledgeContext
): Promise<ResolveSymbolKnowledge> {
  const [entries, mappings] = await Promise.all([
    getSymbolEntries(ctx),
    ctx.orgId
      ? getCustomSymbolMappings(ctx.orgId, ctx.trade, ctx.countryCode)
      : Promise.resolve([]),
  ]);
  return {
    standardLibrary: entries.map(toLibraryEntry),
    userConfirmedMappings: mappings.map(toCompanyMapping),
  };
}

/** Resolve one candidate against project legend + knowledge backend. */
export async function resolveSymbol(
  candidate: DrawingSymbolCandidate,
  ctx: KnowledgeContext & { projectLegendEntries?: LegendLike[] }
): Promise<ResolvedDrawingSymbol> {
  const knowledge = await loadResolveSymbolKnowledge(ctx);
  return resolveDrawingSymbol(candidate, {
    projectLegendEntries: ctx.projectLegendEntries,
    userConfirmedMappings: knowledge.userConfirmedMappings,
    standardLibrary: knowledge.standardLibrary,
    countryCode: ctx.countryCode,
    trade: ctx.trade,
  });
}
