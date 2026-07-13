/**
 * Estimator knowledge context for Gemini prompts (functions side).
 *
 * Reads the structured knowledge backend (symbolLibrary, assemblyTemplates,
 * laborRules, org customSymbolMappings) and formats a COMPACT context block —
 * never the whole database. When Firestore has no seeded knowledge yet, a small
 * embedded SK starter summary keeps the prompt grounded.
 *
 * Web-side twin: src/services/estimatorKnowledge/estimatorKnowledgeContextBuilder.ts
 */

import * as admin from "firebase-admin";

const MAX_SYMBOLS = 40;
const MAX_ALIASES = 6;
const MAX_ASSEMBLIES = 20;
const MAX_LABOR_RULES = 12;
const MAX_MAPPINGS = 30;
const MAX_CONTEXT_CHARS = 4000;

type SymbolRow = {
  normalizedPoint?: string;
  aliases?: string[];
};

type AssemblyRow = {
  normalizedPoint?: string;
  title?: string;
  materialComponents?: Array<{ category?: string }>;
};

type LaborRow = {
  category?: string;
  defaultMinutesPerUnit?: number;
};

type MappingRow = {
  detectedText?: string;
  normalizedPoint?: string;
};

/** Compact embedded fallback — mirrors data/knowledge seeds (aliases only, no glyphs). */
const EMBEDDED_SK_FALLBACK = `KNOWN SYMBOL ALIASES (SK starter — map matching text to normalizedPoint):
- socket_point: zásuvka | zásuvka silnoprúdová | EL.zásuvka | vývod zo zeme | Steckdose | socket
- double_socket_point: dvojzásuvka | 2x zásuvka | double socket
- switch_point: spínač | vypínač | jednopólový spínač | sériový spínač | striedavý spínač | tlačidlový ovládač
- light_output: svetelný vývod | svetelný zdroj | stropné svietidlo | visiace svietidlo | nástenné osvetlenie
- led_strip_point: LED pás | LED pás v SDK | LED pás v svetelnej lište | LED strip
- installation_box: inštalačná krabica | krabica
- cable_route: vodič | vedenie | kábel | CYKY | UTP
- distribution_board: rozvádzač | RZ | rozvodnica
- breaker: istič | poistka | odpínač | výkonový vypínač
- grounding: uzemnenie | ochranné uzemnenie`;

async function readRows<T>(
  db: admin.firestore.Firestore,
  path: string,
  trade: string,
  countryCode: string,
  cap: number
): Promise<T[]> {
  try {
    const snap = await db
      .collection(path)
      .where("trade", "==", trade)
      .where("active", "==", true)
      .limit(cap * 3)
      .get();
    const cc = countryCode.toUpperCase();
    return snap.docs
      .map((d) => d.data() as T & { countryCodes?: string[] })
      .filter(
        (r) =>
          !Array.isArray(r.countryCodes) ||
          r.countryCodes.length === 0 ||
          r.countryCodes.map((c) => String(c).toUpperCase()).includes(cc)
      )
      .slice(0, cap) as T[];
  } catch {
    return [];
  }
}

export async function buildEstimatorKnowledgeContext(params: {
  countryCode: string;
  trade?: string;
  orgId?: string;
}): Promise<string> {
  const trade = params.trade ?? "electrical";
  const db = admin.firestore();

  const [symbols, assemblies, laborRules] = await Promise.all([
    readRows<SymbolRow>(db, "symbolLibrary", trade, params.countryCode, MAX_SYMBOLS),
    readRows<AssemblyRow>(db, "assemblyTemplates", trade, params.countryCode, MAX_ASSEMBLIES),
    readRows<LaborRow>(db, "laborRules", trade, params.countryCode, MAX_LABOR_RULES),
  ]);

  let mappings: MappingRow[] = [];
  if (params.orgId) {
    try {
      const snap = await db
        .collection("organizations")
        .doc(params.orgId)
        .collection("customSymbolMappings")
        .where("trade", "==", trade)
        .limit(MAX_MAPPINGS)
        .get();
      mappings = snap.docs.map((d) => d.data() as MappingRow);
    } catch {
      mappings = [];
    }
  }

  const lines: string[] = [];
  if (symbols.length > 0) {
    lines.push("KNOWN SYMBOL ALIASES (country/trade specific — map matching text to normalizedPoint):");
    for (const s of symbols) {
      if (!s.normalizedPoint || !Array.isArray(s.aliases)) continue;
      lines.push(`- ${s.normalizedPoint}: ${s.aliases.slice(0, MAX_ALIASES).join(" | ")}`);
    }
  }
  if (mappings.length > 0) {
    lines.push("COMPANY-CONFIRMED MAPPINGS (highest priority after project legend — never override with a guess):");
    for (const m of mappings) {
      if (!m.detectedText || !m.normalizedPoint) continue;
      lines.push(`- "${m.detectedText}" => ${m.normalizedPoint}`);
    }
  }
  if (assemblies.length > 0) {
    lines.push("ASSEMBLY CONCEPTS (a symbol is a technical point, not a product):");
    for (const a of assemblies) {
      if (!a.normalizedPoint || !a.title) continue;
      const mats = (a.materialComponents ?? [])
        .slice(0, 4)
        .map((m) => m.category)
        .filter(Boolean)
        .join(", ");
      lines.push(`- ${a.normalizedPoint} → ${a.title}${mats ? ` [${mats}]` : ""}`);
    }
  }
  if (laborRules.length > 0) {
    lines.push("LABOR HINTS (minutes per unit — do not invent different productivity):");
    for (const r of laborRules) {
      if (!r.category || typeof r.defaultMinutesPerUnit !== "number") continue;
      lines.push(`- ${r.category}: ~${r.defaultMinutesPerUnit} min/unit`);
    }
  }

  const text = lines.join("\n").slice(0, MAX_CONTEXT_CHARS);
  return text.trim().length > 0 ? text : EMBEDDED_SK_FALLBACK;
}
