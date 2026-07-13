"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useAuth } from "@/context/AuthContext";
import { useWorkspace } from "@/context/WorkspaceContext";
import { useI18n } from "@/i18n/I18nContext";
import { isAiSymbolLibraryEnabled } from "@/lib/ai/symbolToAssemblyFeature";
import {
  mapSymbolsToAssemblies,
  validateAssembliesForFixedQuote,
} from "@/lib/ai/mapSymbolsToAssemblies";
import {
  buildEstimatorExtractionQualityReport,
  evidenceSourceTypeFromResolver,
  normalizeSourceEvidence,
  validateAssemblyExpansion,
} from "@/lib/ai/estimatorExtractionQuality";
import { saveEstimatorSessionSnapshot } from "@/services/estimatorKnowledge/estimatorSessionService";
import {
  buildEstimatorPositionsFromFacts,
  buildPdfOverlayAnnotations,
} from "@/lib/ai/estimatorPositions";
import type { ElectricalAssemblyTemplate, NormalizedElectricalPoint } from "@/lib/ai/electricalAssemblyTemplates";
import { isProductSourcingEnabled } from "@/lib/products/productSourcingFeature";
import { cn } from "@/lib/utils";
import {
  loadResolveSymbolKnowledge,
  type ResolveSymbolKnowledge,
} from "@/services/estimatorKnowledge/knowledgeSymbolResolver";
import { loadAssemblyTemplatesForContext } from "@/services/estimatorKnowledge/assemblyMapper";
import {
  getCompanyEstimatorSettings,
  getKnowledgePackForContext,
  getLaborRules,
} from "@/services/estimatorKnowledge/knowledgeRepository";
import {
  isAiEstimatorDebugEnabled,
  logAiEstimatorDebug,
} from "@/lib/ai/aiEstimatorFeature";
import {
  matchProductsFromPricebookOrCatalog,
  type AssemblyProductMatch,
} from "@/services/estimatorKnowledge/productMatcher";
import { saveCustomSymbolMapping } from "@/services/estimatorKnowledge/customSymbolMappingService";
import type { CompanyEstimatorSettings } from "@/types/estimatorKnowledge";
import type { AiEstimatorFacts } from "@/types/aiEstimator";

type Props = {
  facts: AiEstimatorFacts;
  countryCode?: string;
};

const CONFIRMABLE_POINTS: NormalizedElectricalPoint[] = [
  "socket_point",
  "double_socket_point",
  "switch_point",
  "light_output",
  "led_strip_point",
  "installation_box",
  "cable_route",
  "distribution_board",
  "breaker",
  "grounding",
];

const POINT_LABELS_SK: Record<string, string> = {
  socket_point: "Zásuvka",
  double_socket_point: "Dvojzásuvka",
  switch_point: "Spínač / vypínač",
  light_output: "Svetelný vývod",
  led_strip_point: "LED pás",
  installation_box: "Inštalačná krabica",
  cable_route: "Kábel / trasa",
  distribution_board: "Rozvádzač",
  breaker: "Istič / poistka",
  grounding: "Uzemnenie",
};

function sourceLabel(source: string, t: (k: string) => string): string {
  switch (source) {
    case "project_legend":
      return t("projects.aiEstimator.assembly.source.legend");
    case "user_confirmed":
      return t("projects.aiEstimator.assembly.source.user");
    case "company_custom":
      return t("projects.aiEstimator.assembly.source.company");
    case "licensed_standard_pack":
      return t("projects.aiEstimator.assembly.source.licensed");
    case "standard_reference_metadata":
      return t("projects.aiEstimator.assembly.source.standard");
    case "ai_inferred":
      return t("projects.aiEstimator.assembly.source.ai");
    default:
      return t("projects.aiEstimator.assembly.source.unknown");
  }
}

function priceStatusLabel(status: string, t: (k: string) => string): string {
  switch (status) {
    case "ready":
      return t("projects.aiEstimator.assembly.price.ready");
    case "partial":
      return t("projects.aiEstimator.assembly.price.partial");
    case "review_only":
      return t("projects.aiEstimator.assembly.price.reviewOnly");
    default:
      return t("projects.aiEstimator.assembly.price.missing");
  }
}

function productPriceLabel(
  status: AssemblyProductMatch["priceStatus"],
  t: (k: string) => string
): string {
  return t(`projects.aiEstimator.assembly.priceStatus.${status}`);
}

/**
 * Backend-powered "Značka → položka → produkt → cena" view.
 * Knowledge (symbols, mappings, templates, company settings) comes from the
 * estimator knowledge backend; product prices from pricebook/catalog matching.
 */
export function AiEstimatorSymbolAssemblySection({ facts, countryCode = "SK" }: Props) {
  const { t } = useI18n();
  const { user } = useAuth();
  const { activeWorkspace } = useWorkspace();
  const enabled = isAiSymbolLibraryEnabled();

  const orgId = activeWorkspace?.orgId ?? user?.id ?? "";

  const [knowledge, setKnowledge] = useState<ResolveSymbolKnowledge | null>(null);
  const [templates, setTemplates] = useState<ElectricalAssemblyTemplate[]>([]);
  const [settings, setSettings] = useState<CompanyEstimatorSettings | null>(null);
  const [debugInfo, setDebugInfo] = useState<{
    packIds: string[];
    symbolEntryCount: number;
    aliasCount: number;
    templateCount: number;
    laborRuleCount: number;
    customMappingCount: number;
    settingsSummary: string;
  } | null>(null);
  const [productMatches, setProductMatches] = useState<Map<string, AssemblyProductMatch>>(
    new Map()
  );
  const [confirmSelections, setConfirmSelections] = useState<Record<string, string>>({});
  const [confirmStatus, setConfirmStatus] = useState<Record<string, "saved" | "error">>({});

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    const ctx = { countryCode, trade: "electrical" as const, orgId: orgId || undefined };
    void Promise.all([
      loadResolveSymbolKnowledge(ctx),
      loadAssemblyTemplatesForContext(ctx),
      orgId ? getCompanyEstimatorSettings(orgId) : Promise.resolve(null),
      isAiEstimatorDebugEnabled()
        ? getKnowledgePackForContext(countryCode, "electrical")
        : Promise.resolve([]),
      isAiEstimatorDebugEnabled() ? getLaborRules(ctx) : Promise.resolve([]),
    ]).then(([k, tpl, s, packs, rules]) => {
      if (cancelled) return;
      setKnowledge(k);
      setTemplates(tpl);
      setSettings(s);
      if (isAiEstimatorDebugEnabled()) {
        const info = {
          packIds: packs.map((p) => p.id),
          symbolEntryCount: k.standardLibrary.length,
          aliasCount: k.standardLibrary.reduce((sum, e) => sum + e.aliases.length, 0),
          templateCount: tpl.length,
          laborRuleCount: rules.length,
          customMappingCount: k.userConfirmedMappings.length,
          settingsSummary: s
            ? `${s.priceTier} · marža ${s.defaultMaterialMarginPercent}% · sadzba ${s.defaultLaborRate} €/h${
                s.preferredBrands.length ? ` · ${s.preferredBrands.join(", ")}` : ""
              }`
            : "default",
        };
        setDebugInfo(info);
        logAiEstimatorDebug("knowledge-context-loaded", info);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [enabled, countryCode, orgId]);

  const mapped = useMemo(() => {
    if (!enabled) return null;
    const occurrences = [
      ...(facts.symbolOccurrences ?? []).map((s) => ({
        id: s.id,
        title: s.title,
        visibleLabel: s.visibleLabel,
        roomName: s.roomName,
        quantity: s.quantity,
        unit: s.unit,
        page: s.page,
        normalizedType: s.normalizedType,
        legendEntryId: s.legendEntryId,
        needsReview: s.needsReview,
        reviewReason: s.reviewReason,
      })),
      ...(facts.extractedItems ?? [])
        .filter((i) => i.included !== false)
        .slice(0, 80)
        .map((i) => ({
          id: `item_${i.id}`,
          title: i.title,
          visibleLabel: i.symbolCode,
          roomName: i.roomName,
          quantity: i.computedQuantity ?? i.quantity,
          unit: i.unit,
          page: i.pageNumber,
          needsReview: i.needsReview,
          reviewReason: i.reviewReason,
        })),
    ];
    const input =
      (facts.symbolOccurrences?.length ?? 0) > 0
        ? occurrences.filter((o) => !o.id.startsWith("item_"))
        : occurrences;

    return mapSymbolsToAssemblies(input, {
      legendEntries: (facts.legendEntries ?? []).map((l) => ({
        id: l.id,
        symbolLabel: l.symbolLabel,
        symbolDescription: l.symbolDescription,
        normalizedType: l.normalizedType,
      })),
      countryCode,
      includeTestingRevision: true,
      standardLibrary: knowledge?.standardLibrary,
      userConfirmedMappings: knowledge?.userConfirmedMappings,
      assemblyTemplates: templates.length ? templates : undefined,
      preferredBrand: settings?.preferredBrands?.[0],
    });
  }, [enabled, facts, countryCode, knowledge, templates, settings]);

  // Structured session snapshot (estimatorSessions/{id}) — sanitized, additive.
  // Every stored symbol match carries normalized evidence (no undefined
  // source/page/confidence) so future visual review can point back to the page.
  const savedSnapshotRef = useRef<string>("");
  useEffect(() => {
    if (!mapped || !orgId || !facts.sessionId) return;
    const expansion = validateAssemblyExpansion(mapped);
    const gate = validateAssembliesForFixedQuote(mapped.assemblies);
    const { report } = buildEstimatorExtractionQualityReport({ facts, mapped });
    const occurrenceById = new Map(
      (facts.symbolOccurrences ?? []).map((o) => [o.id, o] as const)
    );
    const resolved = mapped.resolvedSymbols.slice(0, 200);
    const symbolMatches = resolved.map((r) => ({
      detectedText: r.matchedText,
      normalizedPoint: r.normalizedPoint,
      sourceType: r.sourceType,
      confidence: r.confidence,
      needsReview: r.needsReview,
    }));
    const evidence = resolved.map((r) => {
      const occ = r.candidateId ? occurrenceById.get(r.candidateId) : undefined;
      return normalizeSourceEvidence(
        {
          fileName: occ?.evidence?.[0]?.fileName,
          page: occ?.page ?? occ?.evidence?.[0]?.page,
          sourceText: r.matchedText,
          sourceType: evidenceSourceTypeFromResolver(r.sourceType),
          confidence: r.confidence,
          needsReview: r.needsReview,
          bbox: occ?.bbox ?? null,
        },
        facts.diagnostics?.fileNames?.[0]
      );
    });
    const hash = JSON.stringify([facts.sessionId, symbolMatches, report]);
    if (savedSnapshotRef.current === hash) return;
    savedSnapshotRef.current = hash;
    // Evidence-linked takeoff positions (interactive PDF review in setup=ai).
    const positions = buildEstimatorPositionsFromFacts(facts, {
      fileName: facts.diagnostics?.fileNames?.[0] ?? "podklad.pdf",
      trade: "electrical",
    });
    void saveEstimatorSessionSnapshot({
      id: facts.sessionId,
      orgId,
      files: (facts.diagnostics?.fileNames ?? []).map((fileName) => ({ fileName })),
      drawingInterpretation: { qualityReport: report, evidence },
      symbolMatches,
      positions,
      pdfOverlayAnnotations: buildPdfOverlayAnnotations(positions),
      qualityGate: {
        ok: gate.ok && expansion.ok && !report.fixedQuoteBlocked,
        errors: [...gate.errors, ...expansion.problems],
        warnings: gate.warnings,
      },
      status: "review",
    });
  }, [mapped, orgId, facts]);

  useEffect(() => {
    if (!mapped || !isProductSourcingEnabled()) return;
    let cancelled = false;
    void matchProductsFromPricebookOrCatalog(
      mapped.productSearchIntents,
      { countryCode, trade: "electrical", orgId: orgId || undefined },
      settings ? { settings } : undefined
    ).then((matches) => {
      if (cancelled) return;
      setProductMatches(new Map(matches.map((m) => [m.intent.takeoffItemId, m])));
    });
    return () => {
      cancelled = true;
    };
  }, [mapped, countryCode, orgId, settings]);

  if (!enabled || !mapped) return null;

  const byGroup = mapped.quoteGroups.map((g) => ({
    ...g,
    assemblies: mapped.assemblies.filter((a) => g.assemblyIds.includes(a.id)),
  }));

  const confirmMapping = async (symbolKey: string, detectedText: string) => {
    const point = confirmSelections[symbolKey] as NormalizedElectricalPoint | undefined;
    if (!point || !orgId || !user?.id) return;
    const template = templates.find((tp) => tp.normalizedPoint === point);
    const id = await saveCustomSymbolMapping({
      orgId,
      trade: "electrical",
      countryCode,
      detectedText,
      normalizedPoint: point,
      assemblyTemplateId: template?.id,
      createdBy: user.id,
    }).catch(() => null);
    setConfirmStatus((prev) => ({ ...prev, [symbolKey]: id ? "saved" : "error" }));
    if (id) {
      // Refresh mappings so the resolver picks it up immediately.
      const k = await loadResolveSymbolKnowledge({
        countryCode,
        trade: "electrical",
        orgId,
      }).catch(() => null);
      if (k) setKnowledge(k);
    }
  };

  return (
    <div className="space-y-4 text-sm" data-testid="ai-symbol-assembly-section">
      <div>
        <h3 className="text-sm font-bold text-[#0F2A4D] dark:text-foreground">
          {t("projects.aiEstimator.assembly.title")}
        </h3>
        <p className="mt-1 text-xs text-muted-foreground leading-relaxed">
          {t("projects.aiEstimator.assembly.lead")}
        </p>
      </div>

      {debugInfo ? (
        <div
          className="rounded-lg border border-dashed border-slate-400/60 bg-slate-500/5 px-3 py-2 font-mono text-[11px] text-muted-foreground"
          data-testid="ai-knowledge-debug"
        >
          <p className="font-semibold">Knowledge backend (debug)</p>
          <p>packs: {debugInfo.packIds.join(", ") || "—"}</p>
          <p>
            symboly: {debugInfo.symbolEntryCount} · aliasy: {debugInfo.aliasCount} ·
            šablóny: {debugInfo.templateCount} · pravidlá práce: {debugInfo.laborRuleCount}
          </p>
          <p>
            firemné nastavenia: {debugInfo.settingsSummary} · vlastné mapovania:{" "}
            {debugInfo.customMappingCount}
          </p>
        </div>
      ) : null}

      {mapped.blocksFixedQuote ? (
        <div
          className="rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-amber-950 dark:text-amber-100"
          role="status"
        >
          {t("projects.aiEstimator.assembly.blocksFixed")}
        </div>
      ) : null}

      {mapped.reviewOnlySymbols.length > 0 ? (
        <div className="rounded-lg border border-[var(--border)] px-3 py-2 space-y-2">
          <p className="text-xs font-semibold uppercase text-muted-foreground">
            {t("projects.aiEstimator.assembly.unknownTitle")}
          </p>
          <ul className="text-xs space-y-2">
            {mapped.reviewOnlySymbols.slice(0, 12).map((s) => {
              const key = s.candidateId ?? s.matchedText;
              const status = confirmStatus[key];
              return (
                <li key={key} className="space-y-1">
                  <p>
                    {s.displayName}
                    {s.reviewReason ? (
                      <span className="text-muted-foreground"> — {s.reviewReason}</span>
                    ) : null}
                  </p>
                  {orgId && user?.id && status !== "saved" ? (
                    <div className="flex flex-wrap items-center gap-2">
                      <label className="sr-only" htmlFor={`confirm-${key}`}>
                        {t("projects.aiEstimator.assembly.confirmMapping.label")}
                      </label>
                      <select
                        id={`confirm-${key}`}
                        className="rounded-md border border-[var(--border)] bg-background px-2 py-1 text-xs"
                        value={confirmSelections[key] ?? ""}
                        onChange={(e) =>
                          setConfirmSelections((prev) => ({ ...prev, [key]: e.target.value }))
                        }
                      >
                        <option value="">
                          {t("projects.aiEstimator.assembly.confirmMapping.placeholder")}
                        </option>
                        {CONFIRMABLE_POINTS.map((p) => (
                          <option key={p} value={p}>
                            {POINT_LABELS_SK[p] ?? p}
                          </option>
                        ))}
                      </select>
                      <button
                        type="button"
                        className="rounded-md bg-[#1D376A] px-2 py-1 text-xs font-semibold text-white disabled:opacity-50"
                        disabled={!confirmSelections[key]}
                        onClick={() => void confirmMapping(key, s.matchedText)}
                      >
                        {t("projects.aiEstimator.assembly.confirmMapping.save")}
                      </button>
                    </div>
                  ) : null}
                  {status === "saved" ? (
                    <p className="text-emerald-700 dark:text-emerald-300">
                      {t("projects.aiEstimator.assembly.confirmMapping.saved")}
                    </p>
                  ) : null}
                  {status === "error" ? (
                    <p className="text-red-700 dark:text-red-300">
                      {t("projects.aiEstimator.assembly.confirmMapping.error")}
                    </p>
                  ) : null}
                </li>
              );
            })}
          </ul>
        </div>
      ) : null}

      {byGroup.length === 0 ? (
        <p className="text-muted-foreground text-xs">{t("projects.aiEstimator.assembly.empty")}</p>
      ) : null}

      {byGroup.map((group) => (
        <section
          key={group.id}
          className="rounded-xl border-2 border-[#CBD5E1] dark:border-[var(--border)] bg-white dark:bg-[var(--card)] p-3 space-y-3"
        >
          <p className="text-xs font-bold uppercase tracking-wide text-[#1D376A] dark:text-foreground">
            {group.titleSk}
          </p>
          <ul className="space-y-3">
            {group.assemblies.map((a) => (
              <li
                key={a.id}
                className={cn(
                  "rounded-lg border border-[#E2E8F0] dark:border-[var(--border)] p-3 space-y-2",
                  a.needsReview && "bg-amber-500/5"
                )}
              >
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="font-semibold text-[#0F2A4D] dark:text-foreground">
                      {a.recognizedAs}
                      {a.roomName ? (
                        <span className="font-normal text-muted-foreground">
                          {" "}
                          · {a.roomName}
                        </span>
                      ) : null}
                    </p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {t("projects.aiEstimator.assembly.recognizedAs")} →{" "}
                      <span className="font-medium text-foreground">{a.assemblyTitle}</span>
                      {a.quantity != null
                        ? ` · ${a.quantity} ${a.unit}`
                        : ` · ${t("projects.aiEstimator.assembly.qtyMissing")}`}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-1">
                    <span className="rounded-full bg-slate-100 dark:bg-slate-800 px-2 py-0.5 text-[10px] font-bold uppercase">
                      {sourceLabel(a.sourceType, t)}
                    </span>
                    {mapped.resolvedSymbols.find((r) => r.candidateId === a.sourceSymbolId) ? (
                      <span className="rounded-full bg-slate-100 dark:bg-slate-800 px-2 py-0.5 text-[10px] font-bold uppercase">
                        {t(
                          `projects.aiEstimator.assembly.confidence.${
                            mapped.resolvedSymbols.find(
                              (r) => r.candidateId === a.sourceSymbolId
                            )!.confidence
                          }`
                        )}
                      </span>
                    ) : null}
                    <span
                      className={cn(
                        "rounded-full px-2 py-0.5 text-[10px] font-bold uppercase",
                        a.priceStatus === "ready"
                          ? "bg-emerald-50 text-emerald-800"
                          : "bg-amber-50 text-amber-900"
                      )}
                    >
                      {priceStatusLabel(a.priceStatus, t)}
                    </span>
                    {a.needsReview ? (
                      <span className="rounded-full bg-amber-100 dark:bg-amber-900/50 px-2 py-0.5 text-[10px] font-bold uppercase text-amber-900 dark:text-amber-100">
                        {t("projects.aiEstimator.assembly.needsReview")}
                      </span>
                    ) : null}
                  </div>
                </div>

                <div className="text-xs space-y-1">
                  <p className="font-semibold text-[#64748B]">
                    {t("projects.aiEstimator.assembly.template")}
                  </p>
                  <p className="text-muted-foreground">
                    {a.assemblyTitle}
                    <span className="text-[10px]"> · {a.assemblyTemplateId}</span>
                  </p>
                  <p className="font-semibold text-[#64748B] pt-1">
                    {t("projects.aiEstimator.assembly.products")}
                  </p>
                  <ul className="list-disc pl-4 space-y-0.5">
                    {a.materialLines
                      .filter((m) => m.productRequired)
                      .map((m) => {
                        const match = productMatches.get(`${a.id}__${m.category}`);
                        return (
                          <li key={`${a.id}_${m.title}`}>
                            {m.title}
                            {m.quantity != null ? ` · ${m.quantity} ${m.unit}` : ""}
                            {match?.best &&
                            typeof match.best.netUnitPrice === "number" &&
                            match.best.netUnitPrice > 0 ? (
                              <span className="text-muted-foreground">
                                {" "}
                                — {match.best.productName} ·{" "}
                                {match.best.netUnitPrice.toFixed(2)} {match.best.currency}/
                                {m.unit}
                              </span>
                            ) : null}
                            {match ? (
                              <span
                                className={cn(
                                  "ml-1 rounded-full px-1.5 py-0.5 text-[10px] font-bold uppercase",
                                  match.priceStatus === "confirmed"
                                    ? "bg-emerald-50 text-emerald-800"
                                    : match.priceStatus === "indicative"
                                      ? "bg-sky-50 text-sky-800"
                                      : "bg-amber-50 text-amber-900"
                                )}
                              >
                                {productPriceLabel(match.priceStatus, t)}
                              </span>
                            ) : null}
                            {m.missingSpecs.length > 0
                              ? ` — ${t("projects.aiEstimator.assembly.chooseBrand")}`
                              : m.needsReview && !match
                                ? ` — ${t("projects.aiEstimator.badge.needsCheck")}`
                                : ""}
                          </li>
                        );
                      })}
                  </ul>
                  {a.requiredQuestions.length > 0 ? (
                    <>
                      <p className="font-semibold text-[#64748B] pt-1">
                        {t("projects.aiEstimator.assembly.questions")}
                      </p>
                      <ul className="list-disc pl-4 text-amber-800 dark:text-amber-200">
                        {a.requiredQuestions.map((q) => (
                          <li key={q}>{q}</li>
                        ))}
                      </ul>
                    </>
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
