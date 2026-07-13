/**
 * Estimator Knowledge Repository — Firestore-first, seed-fallback.
 *
 * Reads structured estimating know-how (symbol library, assembly templates,
 * labor rules, company settings, user-confirmed mappings). When Firestore is
 * empty or unavailable the bundled SK seed data keeps the estimator working —
 * know-how never lives only in prompts.
 */

import {
  collection,
  doc,
  getDoc,
  getDocs,
  getFirestoreInstance,
  limit,
  query,
  where,
} from "@/lib/firebase";
import type {
  CompanyEstimatorSettings,
  CustomSymbolMapping,
  KnowledgeAssemblyTemplate,
  KnowledgeContext,
  KnowledgePack,
  KnowledgeSymbolEntry,
  LaborRule,
} from "@/types/estimatorKnowledge";
import symbolsSeed from "../../../data/knowledge/electrical-symbols-sk.json";
import assembliesSeed from "../../../data/knowledge/electrical-assemblies-sk.json";
import laborSeed from "../../../data/knowledge/electrical-labor-rules-sk.json";

export const DEFAULT_COMPANY_ESTIMATOR_SETTINGS: CompanyEstimatorSettings = {
  preferredBrands: [],
  preferredSuppliers: [],
  defaultMaterialMarginPercent: 25,
  defaultLaborRate: 28,
  defaultRiskReservePercent: 5,
  allowIndicativePrices: true,
  priceTier: "standard",
};

function matchesContext(
  row: { trade: string; countryCodes: string[]; active?: boolean },
  ctx: KnowledgeContext
): boolean {
  if (row.active === false) return false;
  if (row.trade !== ctx.trade && row.trade !== "general") return false;
  const cc = ctx.countryCode.toUpperCase();
  return (
    row.countryCodes.length === 0 ||
    row.countryCodes.map((c) => c.toUpperCase()).includes(cc)
  );
}

// ---------------------------------------------------------------------------
// Seed accessors (always available, no Firestore needed)
// ---------------------------------------------------------------------------

export function getSeedKnowledgePacks(): KnowledgePack[] {
  return [
    symbolsSeed.pack as KnowledgePack,
    assembliesSeed.pack as KnowledgePack,
    laborSeed.pack as KnowledgePack,
  ];
}

export function getSeedSymbolEntries(): KnowledgeSymbolEntry[] {
  return symbolsSeed.symbols as KnowledgeSymbolEntry[];
}

export function getSeedAssemblyTemplates(): KnowledgeAssemblyTemplate[] {
  return assembliesSeed.assemblies as KnowledgeAssemblyTemplate[];
}

export function getSeedLaborRules(): LaborRule[] {
  return laborSeed.laborRules as unknown as LaborRule[];
}

// ---------------------------------------------------------------------------
// Firestore-first reads with seed fallback
// ---------------------------------------------------------------------------

async function readCollection<T>(
  path: string,
  ctx: KnowledgeContext,
  fallback: T[]
): Promise<T[]> {
  const fs = getFirestoreInstance();
  if (!fs) return fallback.filter((r) => matchesContext(r as never, ctx));
  try {
    const snap = await getDocs(
      query(
        collection(fs, path),
        where("trade", "==", ctx.trade),
        where("active", "==", true),
        limit(300)
      )
    );
    if (snap.empty) {
      return fallback.filter((r) => matchesContext(r as never, ctx));
    }
    const rows = snap.docs.map((d) => ({ id: d.id, ...d.data() }) as T);
    return rows.filter((r) => matchesContext(r as never, ctx));
  } catch {
    return fallback.filter((r) => matchesContext(r as never, ctx));
  }
}

export async function getKnowledgePackForContext(
  countryCode: string,
  trade: KnowledgeContext["trade"],
  _documentType?: string
): Promise<KnowledgePack[]> {
  const ctx: KnowledgeContext = { countryCode, trade };
  return readCollection<KnowledgePack>("knowledgePacks", ctx, getSeedKnowledgePacks());
}

export async function getSymbolEntries(
  ctx: KnowledgeContext
): Promise<KnowledgeSymbolEntry[]> {
  return readCollection<KnowledgeSymbolEntry>("symbolLibrary", ctx, getSeedSymbolEntries());
}

export async function getAssemblyTemplates(
  ctx: KnowledgeContext
): Promise<KnowledgeAssemblyTemplate[]> {
  return readCollection<KnowledgeAssemblyTemplate>(
    "assemblyTemplates",
    ctx,
    getSeedAssemblyTemplates()
  );
}

export async function getLaborRules(ctx: KnowledgeContext): Promise<LaborRule[]> {
  return readCollection<LaborRule>("laborRules", ctx, getSeedLaborRules());
}

export async function getCompanyEstimatorSettings(
  orgId: string
): Promise<CompanyEstimatorSettings> {
  const fs = getFirestoreInstance();
  if (!fs || !orgId) return DEFAULT_COMPANY_ESTIMATOR_SETTINGS;
  try {
    const snap = await getDoc(
      doc(fs, "organizations", orgId, "estimatorSettings", "default")
    );
    if (!snap.exists()) return DEFAULT_COMPANY_ESTIMATOR_SETTINGS;
    return { ...DEFAULT_COMPANY_ESTIMATOR_SETTINGS, ...(snap.data() as Partial<CompanyEstimatorSettings>) };
  } catch {
    return DEFAULT_COMPANY_ESTIMATOR_SETTINGS;
  }
}

export async function getCustomSymbolMappings(
  orgId: string,
  trade: KnowledgeContext["trade"],
  countryCode: string
): Promise<CustomSymbolMapping[]> {
  const fs = getFirestoreInstance();
  if (!fs || !orgId) return [];
  try {
    const snap = await getDocs(
      query(
        collection(fs, "organizations", orgId, "customSymbolMappings"),
        where("trade", "==", trade),
        limit(200)
      )
    );
    const cc = countryCode.toUpperCase();
    return snap.docs
      .map((d) => ({ id: d.id, ...d.data() }) as CustomSymbolMapping)
      .filter((m) => !m.countryCode || m.countryCode.toUpperCase() === cc);
  } catch {
    return [];
  }
}
