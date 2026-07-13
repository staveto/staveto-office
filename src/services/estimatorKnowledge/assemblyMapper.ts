/**
 * Assembly mapper — normalizedPoint → assembly template → material/labor lines,
 * with templates and labor rules loaded from the knowledge backend.
 */

import {
  findAssemblyTemplate,
  type ElectricalAssemblyTemplate,
  type NormalizedElectricalPoint,
} from "@/lib/ai/electricalAssemblyTemplates";
import {
  expandAssembly,
  type AssemblyInstance,
} from "@/lib/ai/mapSymbolsToAssemblies";
import type { ResolvedDrawingSymbol } from "@/lib/ai/symbolResolver";
import type {
  KnowledgeAssemblyTemplate,
  KnowledgeContext,
  LaborRule,
} from "@/types/estimatorKnowledge";
import { getAssemblyTemplates, getLaborRules } from "./knowledgeRepository";

/** Knowledge doc → in-code template shape (drops backend-only metadata). */
export function toElectricalAssemblyTemplate(
  t: KnowledgeAssemblyTemplate
): ElectricalAssemblyTemplate {
  return {
    id: t.id,
    normalizedPoint: t.normalizedPoint,
    title: t.title,
    quoteGroup: t.quoteGroup,
    defaultUnit: t.defaultUnit,
    materialComponents: t.materialComponents,
    laborComponents: t.laborComponents,
    requiredQuestions: t.requiredQuestions,
    assumptions: t.assumptions,
    riskFlags: t.riskFlags,
  };
}

export async function loadAssemblyTemplatesForContext(
  ctx: KnowledgeContext
): Promise<ElectricalAssemblyTemplate[]> {
  const rows = await getAssemblyTemplates(ctx);
  return rows.map(toElectricalAssemblyTemplate);
}

/** Backend template wins over in-code starter template. */
export async function mapNormalizedPointToAssembly(
  normalizedPoint: NormalizedElectricalPoint,
  ctx: KnowledgeContext
): Promise<ElectricalAssemblyTemplate | undefined> {
  if (normalizedPoint === "unknown") return undefined;
  const backend = await loadAssemblyTemplatesForContext(ctx);
  return (
    backend.find((t) => t.normalizedPoint === normalizedPoint) ??
    findAssemblyTemplate(normalizedPoint)
  );
}

/** Apply labor rules (minutes per unit + difficulty factor) onto expanded labor lines. */
export function applyLaborRules(
  assembly: AssemblyInstance,
  rules: LaborRule[],
  difficultyKey?: string
): AssemblyInstance {
  const rule = rules.find((r) => matchesLaborCategory(r.category, assembly));
  if (!rule || assembly.quantity == null) return assembly;
  const factor =
    difficultyKey && rule.difficultyFactors[difficultyKey] != null
      ? rule.difficultyFactors[difficultyKey]!
      : 1;
  const hours =
    Math.round(((assembly.quantity * rule.defaultMinutesPerUnit * factor) / 60) * 100) / 100;
  return {
    ...assembly,
    laborLines: assembly.laborLines.map((l, i) =>
      i === 0 ? { ...l, hours, needsReview: false } : l
    ),
  };
}

function matchesLaborCategory(
  category: LaborRule["category"],
  assembly: AssemblyInstance
): boolean {
  switch (category) {
    case "socket":
      return (
        assembly.normalizedPoint === "socket_point" ||
        assembly.normalizedPoint === "double_socket_point" ||
        assembly.normalizedPoint === "data_socket"
      );
    case "switch":
      return (
        assembly.normalizedPoint === "switch_point" ||
        assembly.normalizedPoint === "dimmer_point"
      );
    case "light_output":
      return (
        assembly.normalizedPoint === "light_output" ||
        assembly.normalizedPoint === "ceiling_light_point" ||
        assembly.normalizedPoint === "pendant_light_point" ||
        assembly.normalizedPoint === "wall_light_point" ||
        assembly.normalizedPoint === "mirror_light_output" ||
        assembly.normalizedPoint === "furniture_light_output"
      );
    case "led_strip":
      return assembly.normalizedPoint === "led_strip_point";
    case "cable_route":
      return assembly.normalizedPoint === "cable_route";
    case "installation_box":
      return assembly.normalizedPoint === "installation_box";
    case "distribution_board":
      return (
        assembly.normalizedPoint === "distribution_board" ||
        assembly.normalizedPoint === "breaker" ||
        assembly.normalizedPoint === "grounding"
      );
    case "testing_revision":
      return assembly.assemblyTemplateId === "testing_revision";
    default:
      return false;
  }
}

/** Expand a resolved symbol into an assembly instance using backend templates + labor rules. */
export async function expandAssemblyToMaterialAndLabor(
  resolved: ResolvedDrawingSymbol,
  quantity: number | null,
  ctx: KnowledgeContext & {
    knownSpecs?: Record<string, string | number | boolean>;
    difficultyKey?: string;
  }
): Promise<AssemblyInstance | undefined> {
  const template = await mapNormalizedPointToAssembly(resolved.normalizedPoint, ctx);
  if (!template) return undefined;
  const withQty: ResolvedDrawingSymbol = { ...resolved, quantity: quantity ?? undefined };
  const expanded = expandAssembly(withQty, template, ctx.knownSpecs ?? {});
  const rules = await getLaborRules(ctx);
  return applyLaborRules(expanded, rules, ctx.difficultyKey);
}
