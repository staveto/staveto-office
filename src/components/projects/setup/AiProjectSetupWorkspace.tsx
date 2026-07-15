"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Sparkles } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { useI18n } from "@/i18n/I18nContext";
import { useWorkspace } from "@/context/WorkspaceContext";
import { listProjectTasks, type ProjectDoc } from "@/lib/projects";
import { listMaterialSuggestions, listProjectMaterials } from "@/services/materials/projectMaterialsService";
import { listProjectQuoteDraftItems } from "@/lib/projects";
import { updateDraftJobFields, updateDraftJobStatus } from "@/services/projects/projectService";
import { upsertQuoteFromProject } from "@/services/quotes";
import { AiSetupStepper } from "./AiSetupStepper";
import { AiSetupSummaryPanel } from "./AiSetupSummaryPanel";
import { AiSetupOverviewStep } from "./AiSetupOverviewStep";
import { AiSetupMaterialStep } from "./AiSetupMaterialStep";
import { AiSetupWorkStep } from "./AiSetupWorkStep";
import { AiSetupPriceStep } from "./AiSetupPriceStep";
import { AiSetupOfferStep } from "./AiSetupOfferStep";
import { syncEstimatorMaterialsToProject } from "@/services/ai/aiEstimatorService";
import {
  isAiEstimatorFlowEnabled,
  isAiEvidencePdfViewerEnabled,
} from "@/lib/ai/aiEstimatorFeature";
import { useEstimatorPositions } from "./useEstimatorPositions";
import type { MaterialSubTab } from "./AiSetupMaterialStep";
import {
  applyProjectFactsToMaterialRows,
  computeAiSetupTotals,
  defaultCalculation,
  freezeCalculationForSave,
  parseAiSetupMeta,
  resolveAiSetupCalculation,
  resolveSetupMaterialRows,
  seedWorkEstimate,
  serializeAiSetupMeta,
  workEstimateFromQuoteItems,
} from "./aiSetupHelpers";
import { loadAiSetupProjectContext, mergeAttachmentContextIntoProjectFacts } from "./aiSetupProjectContext";
import { useActiveWorkspaceContext } from "@/hooks/useActiveWorkspaceContext";
import { AiSetupQualityGatePanel } from "./AiSetupQualityGatePanel";
import { AiSetupProductSourcingPanel } from "./AiSetupProductSourcingPanel";
import { AiSetupPurchaseListPanel } from "./AiSetupPurchaseListPanel";
import {
  composeElectricalCustomerQuote,
  takeoffFromMaterialLikeRows,
} from "@/lib/ai/composeElectricalCustomerQuote";
import {
  qualityGateBlocksFixedQuote,
  validateElectricalEstimateCompleteness,
} from "@/lib/ai/electricalQualityGate";
import { validateQuoteClarity } from "@/lib/ai/validateQuoteClarity";
import { isProductSourcingEnabled } from "@/lib/products/productSourcingFeature";
import {
  DEFAULT_COMPANY_PRODUCT_PREFERENCE,
  type MaterialProductSelection,
  type ProductCandidate,
} from "@/lib/products/productSourcingTypes";
import {
  applyProductSelectionToQuote,
  buildInternalPurchaseList,
  markSelectionCustomerSupplied,
  markSelectionExcluded,
  matchProductsForTakeoffItems,
  sumSelectionSellPrices,
  updateSelectionWithProduct,
  validateProductPricingReady,
} from "@/services/products/productSourcingService";
import { parseQuoteDocumentMeta, type QuoteDocumentMeta } from "@/lib/quoteDocumentMeta";
import { buildElectricalCustomerScopeSk } from "@/lib/quoteCustomerScope";
import { syncMaterialRowsToQuoteItems, syncWorkEstimateToQuoteItems } from "./aiSetupPersistence";
import type {
  AiProjectFactsPersisted,
  AiSetupCalculation,
  AiSetupMaterialRow,
  AiSetupStepId,
  AiSetupWorkEstimate,
} from "./aiSetupTypes";
import { AI_SETUP_STEPS } from "./aiSetupTypes";

function hasEditableProjectFacts(facts?: AiProjectFactsPersisted): boolean {
  if (!facts) return false;
  if (facts.buildingType?.trim()) return true;
  if ((facts.totalKnownAreaM2 ?? 0) > 0) return true;
  if ((facts.rooms?.length ?? 0) > 0) return true;
  if ((facts.dimensions?.length ?? 0) > 0) return true;
  return false;
}

/** Customer PDF scope — never keep internal AI briefs; seed a clean editable default. */
function resolveOfferDocumentMeta(
  notes: string | null | undefined,
  facts?: AiProjectFactsPersisted
): QuoteDocumentMeta {
  const meta = parseQuoteDocumentMeta(notes);
  if (meta.scopeOfWork?.trim()) return meta;
  const isElectrical = /elektro/i.test(facts?.buildingType ?? "");
  return {
    ...meta,
    scopeOfWork: buildElectricalCustomerScopeSk({
      detectedDocumentTypes: isElectrical ? ["electrical_marking"] : [],
      extractedItems: isElectrical
        ? [{ category: "socket" }, { category: "switch" }, { category: "lighting" }]
        : [],
    }),
  };
}

type Props = {
  project: ProjectDoc;
  userId: string;
  onProjectUpdated: (project: ProjectDoc) => void;
};

export function AiProjectSetupWorkspace({ project, userId, onProjectUpdated }: Props) {
  const { t } = useI18n();
  const { activeWorkspace } = useWorkspace();
  const workspaceCtx = useActiveWorkspaceContext();
  const currency = workspaceCtx.activeCurrency || "EUR";
  const countryCode = workspaceCtx.activeCountryCode;
  const [activeStep, setActiveStep] = useState<AiSetupStepId>("overview");
  const [materialSubTab, setMaterialSubTab] = useState<MaterialSubTab>("summary");
  const materialSubTabDefaultedRef = useRef(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [quoteSaved, setQuoteSaved] = useState(false);
  const [savedQuoteId, setSavedQuoteId] = useState<string | null>(null);
  const [exportingPdf, setExportingPdf] = useState(false);

  const [phaseCount, setPhaseCount] = useState(0);
  const [taskCount, setTaskCount] = useState(0);
  const [materials, setMaterials] = useState<AiSetupMaterialRow[]>([]);
  const [workEstimate, setWorkEstimate] = useState<AiSetupWorkEstimate>(() => seedWorkEstimate([]));
  const [calculation, setCalculation] = useState<AiSetupCalculation>(() =>
    resolveAiSetupCalculation(
      undefined,
      project.quoteDraftVatPercent,
      countryCode
    )
  );
  const [documentMeta, setDocumentMeta] = useState<QuoteDocumentMeta>(() =>
    resolveOfferDocumentMeta(project.quoteDraftNotes)
  );
  const [projectFacts, setProjectFacts] = useState<AiProjectFactsPersisted | undefined>();
  const [applyingFacts, setApplyingFacts] = useState(false);
  const [loadingMaterials, setLoadingMaterials] = useState(false);
  const [productSelections, setProductSelections] = useState<MaterialProductSelection[]>([]);
  const [productMatchLoading, setProductMatchLoading] = useState(false);
  const [productMatchWarnings, setProductMatchWarnings] = useState<string[]>([]);
  const productMatchedKeyRef = useRef<string>("");
  const factsSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const autoSyncedRef = useRef(false);
  const productSourcingOn = isProductSourcingEnabled();
  const productPrefs = DEFAULT_COMPANY_PRODUCT_PREFERENCE;

  const materialsLookSparse = (rows: AiSetupMaterialRow[]) => {
    const names = new Set(rows.map((m) => m.name.trim().toLowerCase()).filter(Boolean));
    return rows.length < 5 || names.size <= 2;
  };

  const materialsLookUncounted = (rows: AiSetupMaterialRow[]) => {
    if (rows.length < 3) return false;
    const missing = rows.filter((r) => r.qty <= 1).length;
    return missing >= Math.ceil(rows.length * 0.7);
  };

  useEffect(() => {
    let cancelled = false;

    async function loadInitial() {
      setLoading(true);
      setError(null);
      try {
        const [tasks, suggestions, quoteItems, projectMaterials] = await Promise.all([
          listProjectTasks(project.id),
          listMaterialSuggestions(project.id),
          listProjectQuoteDraftItems(project.id),
          listProjectMaterials(project.id),
        ]);
        if (cancelled) return;

        const phases = new Set(tasks.map((x) => x.phaseId).filter(Boolean));
        setPhaseCount(phases.size || (tasks.length > 0 ? 1 : 0));
        setTaskCount(tasks.length);

        const meta = parseAiSetupMeta(project.quoteDraftNotes);
        let materialRows = resolveSetupMaterialRows(quoteItems, suggestions, projectMaterials);

        const savedFacts = meta?.projectFacts;
        let loadedFacts = savedFacts;

        if (activeWorkspace) {
          const ctx = await loadAiSetupProjectContext({
            projectId: project.id,
            aiDraftId: project.aiDraftId,
            quoteDraftNotes: project.quoteDraftNotes,
            workspace: activeWorkspace,
            userId,
          });
          loadedFacts = hasEditableProjectFacts(savedFacts)
            ? savedFacts
            : mergeAttachmentContextIntoProjectFacts(
                ctx.projectFacts ?? savedFacts,
                ctx.attachmentFindings
              );
        }

        if (loadedFacts) {
          materialRows = applyProjectFactsToMaterialRows(materialRows, loadedFacts, null);
        }

        if (!cancelled) {
          setMaterials(materialRows);
          setProjectFacts(loadedFacts);
        }

        setWorkEstimate(meta?.workEstimate ?? workEstimateFromQuoteItems(quoteItems, tasks));
        setCalculation(
          resolveAiSetupCalculation(
            meta?.calculation,
            project.quoteDraftVatPercent,
            countryCode
          )
        );
        setDocumentMeta(resolveOfferDocumentMeta(project.quoteDraftNotes, loadedFacts));

        // Silently hydrate sparse materials from estimator session / attachments.
        const shouldAutoSync =
          isAiEstimatorFlowEnabled() &&
          !!activeWorkspace &&
          !autoSyncedRef.current &&
          (materialsLookSparse(materialRows) || materialsLookUncounted(materialRows));

        if (shouldAutoSync && !cancelled) {
          autoSyncedRef.current = true;
          setLoadingMaterials(true);
          try {
            await syncEstimatorMaterialsToProject({
              workspace: activeWorkspace,
              userId,
              projectId: project.id,
              sessionId: project.aiEstimatorSessionId,
              regenerateFromAttachments: true,
            });
            if (cancelled) return;
            const [nextSuggestions, nextQuoteItems, nextProjectMaterials] = await Promise.all([
              listMaterialSuggestions(project.id),
              listProjectQuoteDraftItems(project.id),
              listProjectMaterials(project.id),
            ]);
            let nextRows = resolveSetupMaterialRows(
              nextQuoteItems,
              nextSuggestions,
              nextProjectMaterials
            );
            if (loadedFacts) {
              nextRows = applyProjectFactsToMaterialRows(nextRows, loadedFacts, null);
            }
            if (!cancelled) setMaterials(nextRows);
          } catch {
            // Keep already-loaded sparse rows — do not block the setup wizard.
          } finally {
            if (!cancelled) setLoadingMaterials(false);
          }
        }
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : t("projects.aiSetup.loadError"));
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void loadInitial();
    return () => {
      cancelled = true;
    };
  }, [
    project.id,
    project.aiDraftId,
    project.aiEstimatorSessionId,
    project.quoteDraftNotes,
    project.quoteDraftVatPercent,
    activeWorkspace,
    userId,
    countryCode,
    t,
  ]);

  // Sync calculation meta after save — do not reload materials or quote notes.
  useEffect(() => {
    if (loading) return;
    const meta = parseAiSetupMeta(project.quoteDraftNotes);
    if (meta?.workEstimate) setWorkEstimate(meta.workEstimate);
    if (meta?.calculation) {
      setCalculation(resolveAiSetupCalculation(meta.calculation, project.quoteDraftVatPercent, countryCode));
    }
  }, [project.quoteDraftNotes, project.quoteDraftVatPercent, countryCode, loading]);

  const totals = useMemo(
    () => computeAiSetupTotals(materials, workEstimate, calculation),
    [materials, workEstimate, calculation]
  );

  const takeoffRows = useMemo(
    () =>
      takeoffFromMaterialLikeRows(
        materials.map((m) => ({
          id: m.id,
          name: m.name,
          qty: m.qty,
          unit: m.unit,
          price: m.price,
          included: m.included,
          sourceNote: m.sourceNote,
          confidence: m.confidence,
          group: m.group,
        }))
      ),
    [materials]
  );

  const qualityFindings = useMemo(
    () =>
      validateElectricalEstimateCompleteness({
        takeoff: takeoffRows,
        legendTexts: projectFacts?.rooms?.map((r) => r.name) ?? [],
        language: "sk",
      }),
    [takeoffRows, projectFacts]
  );
  const qualityBlocked = qualityGateBlocksFixedQuote(qualityFindings);

  // Evidence-linked takeoff positions (interactive PDF review).
  const evidenceEnabled = isAiEvidencePdfViewerEnabled();
  const handleMaterialPriceApplied = useCallback((materialRowId: string, unitPrice: number) => {
    if (!(unitPrice > 0)) return;
    setMaterials((prev) =>
      prev.map((m) => (m.id === materialRowId ? { ...m, price: unitPrice } : m))
    );
  }, []);
  const handleMaterialRowExcluded = useCallback((materialRowId: string) => {
    setMaterials((prev) =>
      prev.map((m) => (m.id === materialRowId ? { ...m, included: false } : m))
    );
  }, []);
  const estimatorPositions = useEstimatorPositions({
    project,
    workspace: activeWorkspace ?? null,
    userId,
    materials,
    currency,
    enabled: evidenceEnabled,
    onMaterialPriceApplied: handleMaterialPriceApplied,
    onMaterialRowExcluded: handleMaterialRowExcluded,
  });

  // Keep quote materials in sync with plan evidence:
  // ignored/excluded + AI estimates without a PDF mark drop out of the quote.
  useEffect(() => {
    if (!evidenceEnabled || estimatorPositions.loading) return;
    const positions = estimatorPositions.positions;
    if (positions.length === 0) return;

    const excludeIds = new Set<string>();
    for (const p of positions) {
      if (!p.linkedMaterialRowId) continue;
      const inactive =
        p.reviewStatus === "ignored" || p.reviewStatus === "excluded";
      const unmarkedAi =
        p.quantitySource === "ai_estimate" &&
        !p.evidenceAnchors.some((a) => a.bbox != null);
      if (inactive || unmarkedAi) excludeIds.add(p.linkedMaterialRowId);
    }
    if (excludeIds.size === 0) return;

    setMaterials((prev) => {
      let changed = false;
      const next = prev.map((m) => {
        if (!excludeIds.has(m.id) || !m.included) return m;
        changed = true;
        return { ...m, included: false };
      });
      return changed ? next : prev;
    });
  }, [evidenceEnabled, estimatorPositions.loading, estimatorPositions.positions]);

  const missingPriceCount = useMemo(() => {
    if (evidenceEnabled && estimatorPositions.positions.length > 0) {
      return estimatorPositions.summary.priceMissing;
    }
    return materials.filter((m) => m.included && m.name.trim() && !(m.price > 0)).length;
  }, [
    evidenceEnabled,
    estimatorPositions.positions.length,
    estimatorPositions.summary.priceMissing,
    materials,
  ]);

  // Default sub-tab: "Na kontrolu" when prices/review blockers exist, else "Súhrn".
  useEffect(() => {
    if (loading || materialSubTabDefaultedRef.current) return;
    materialSubTabDefaultedRef.current = true;
    if (missingPriceCount > 0 || qualityBlocked) {
      setMaterialSubTab("review");
    }
  }, [loading, missingPriceCount, qualityBlocked]);

  const openMaterialPrices = useCallback(() => {
    setActiveStep("material");
    setMaterialSubTab("prices");
  }, []);

  const quotePackage = useMemo(
    () =>
      composeElectricalCustomerQuote({
        takeoff: takeoffRows,
        language: "sk",
        projectName: project.name,
        materialPricesKnown: materials.some((m) => m.included && m.price > 0),
      }),
    [takeoffRows, materials, project.name]
  );

  const clarity = useMemo(() => {
    const base = validateQuoteClarity({
      quote: quotePackage,
      language: "sk",
      materialTotal: totals.materialCost,
      laborIsGenericOnly:
        workEstimate.hours > 0 &&
        !takeoffRows.some((r) => r.category === "labor" && /zásuv|vypína|LED|rozvád/i.test(r.title)),
      documentMentionsSockets: qualityFindings.some(
        (f) => f.category === "sockets" && f.status === "missing"
      ),
      hasSocketLines: takeoffRows.some((r) => r.category === "socket"),
      documentMentionsSwitches: qualityFindings.some(
        (f) => f.category === "switches" && f.status === "missing"
      ),
      hasSwitchLines: takeoffRows.some((r) => r.category === "switch"),
      hasCableStrategy:
        takeoffRows.some((r) => r.category === "cable") ||
        quotePackage.sections.some((s) => s.id === "cabling"),
      distributionBoardClear: !qualityFindings.some(
        (f) =>
          f.category === "distribution_board_or_explicitly_not_in_scope" &&
          f.status === "missing"
      ),
      testingClear: !qualityFindings.some(
        (f) => f.category === "testing_commissioning" && f.status === "missing"
      ),
      rawCustomerRowCount: materials.filter((m) => m.included && m.customerVisible !== false).length,
    });

    if (!productSourcingOn || productSelections.length === 0) return base;

    const pricing = validateProductPricingReady(productSelections);
    const errors = [...base.errors];
    const warnings = [...base.warnings];
    if (!pricing.ok) {
      errors.push(
        `Ponuka ešte nie je pripravená. Chýbajú ceny alebo produkty pre: ${pricing.missing
          .slice(0, 8)
          .join(", ")}${pricing.missing.length > 8 ? "…" : ""}`
      );
    }
    if (pricing.indicative.length > 0) {
      warnings.push(
        `Orientačné ceny — overte: ${pricing.indicative.slice(0, 6).join(", ")}${
          pricing.indicative.length > 6 ? "…" : ""
        }`
      );
    }
    return {
      ok: base.ok && pricing.ok,
      errors,
      warnings,
    };
  }, [
    quotePackage,
    totals.materialCost,
    workEstimate.hours,
    takeoffRows,
    qualityFindings,
    materials,
    productSourcingOn,
    productSelections,
  ]);

  const purchaseList = useMemo(
    () => (productSourcingOn ? buildInternalPurchaseList(productSelections) : []),
    [productSourcingOn, productSelections]
  );

  const pricingReady = useMemo(
    () =>
      productSourcingOn && productSelections.length > 0
        ? validateProductPricingReady(productSelections)
        : { ok: true, missing: [] as string[], indicative: [] as string[] },
    [productSourcingOn, productSelections]
  );

  const applySelectionsToMaterialsAndTotals = useCallback(
    (nextSelections: MaterialProductSelection[]) => {
      setProductSelections(nextSelections);
      const pricePatches = applyProductSelectionToQuote(materials, nextSelections);
      const byId = new Map(pricePatches.map((p) => [p.id, p.price]));
      setMaterials((prev) =>
        prev.map((m) => {
          if (!byId.has(m.id)) return m;
          const price = byId.get(m.id)!;
          return { ...m, price };
        })
      );
      const sellTotal = sumSelectionSellPrices(nextSelections);
      if (sellTotal > 0) {
        setCalculation((c) => ({ ...c, materialTotalOverride: sellTotal }));
      }
    },
    [materials]
  );

  useEffect(() => {
    if (!productSourcingOn || activeStep !== "price" || materials.length === 0) return;
    const key = materials
      .filter((m) => m.included)
      .map((m) => `${m.id}:${m.name}:${m.qty}:${m.unit}`)
      .join("|");
    if (key === productMatchedKeyRef.current && productSelections.length > 0) return;
    let cancelled = false;
    setProductMatchLoading(true);
    void matchProductsForTakeoffItems({
      materials: materials.map((m) => ({
        id: m.id,
        name: m.name,
        qty: m.qty,
        unit: m.unit,
        included: m.included,
      })),
      preferences: productPrefs,
      countryCode: countryCode || "SK",
      currency,
    })
      .then((result) => {
        if (cancelled) return;
        productMatchedKeyRef.current = key;
        setProductMatchWarnings(result.warnings);
        applySelectionsToMaterialsAndTotals(result.selections);
      })
      .finally(() => {
        if (!cancelled) setProductMatchLoading(false);
      });
    return () => {
      cancelled = true;
    };
    // Re-match when entering price step or material identity changes — not on every selection edit.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [productSourcingOn, activeStep, materials, countryCode, currency]);

  const handleSelectProduct = useCallback(
    (takeoffItemId: string, product: ProductCandidate) => {
      const next = productSelections.map((s) =>
        s.takeoffItemId === takeoffItemId
          ? updateSelectionWithProduct(s, product, productPrefs)
          : s
      );
      applySelectionsToMaterialsAndTotals(next);
    },
    [productSelections, productPrefs, applySelectionsToMaterialsAndTotals]
  );

  const handleManualPrice = useCallback(
    (takeoffItemId: string, netUnitPrice: number) => {
      const next = productSelections.map((s) => {
        if (s.takeoffItemId !== takeoffItemId) return s;
        const base = s.selectedProduct ?? {
          id: `manual-${takeoffItemId}`,
          sourceType: "manual_entry" as const,
          productName: s.requiredTitle,
          category: "other" as const,
          unit: "unknown" as const,
          currency,
          confidence: "confirmed" as const,
          needsReview: false,
        };
        return updateSelectionWithProduct(
          s,
          {
            ...base,
            sourceType: "manual_entry",
            netUnitPrice,
            confidence: "confirmed",
            needsReview: false,
            priceValidAt: new Date().toISOString(),
          },
          productPrefs
        );
      });
      applySelectionsToMaterialsAndTotals(next);
    },
    [productSelections, productPrefs, applySelectionsToMaterialsAndTotals, currency]
  );

  const handleMarkCustomerSupplied = useCallback(
    (takeoffItemId: string) => {
      const next = productSelections.map((s) =>
        s.takeoffItemId === takeoffItemId ? markSelectionCustomerSupplied(s) : s
      );
      applySelectionsToMaterialsAndTotals(next);
    },
    [productSelections, applySelectionsToMaterialsAndTotals]
  );

  const handleExcludeProduct = useCallback(
    (takeoffItemId: string) => {
      const next = productSelections.map((s) =>
        s.takeoffItemId === takeoffItemId ? markSelectionExcluded(s) : s
      );
      applySelectionsToMaterialsAndTotals(next);
    },
    [productSelections, applySelectionsToMaterialsAndTotals]
  );

  const persistMeta = useCallback(
    async (calcOverride?: AiSetupCalculation, factsOverride?: AiProjectFactsPersisted) => {
      const calc = calcOverride ?? calculation;
      const facts = factsOverride ?? projectFacts;
      const notes = serializeAiSetupMeta(
        { workEstimate, calculation: calc, projectFacts: facts },
        undefined,
        documentMeta
      );
      const updated = await updateDraftJobFields(project.id, {
        quoteDraftVatPercent: calc.vatPercent,
        quoteDraftNotes: notes,
      });
      onProjectUpdated(updated);
    },
    [calculation, documentMeta, onProjectUpdated, project.id, projectFacts, workEstimate]
  );

  const handleProjectFactsChange = useCallback(
    (facts: AiProjectFactsPersisted) => {
      setProjectFacts(facts);
      if (factsSaveTimerRef.current) clearTimeout(factsSaveTimerRef.current);
      factsSaveTimerRef.current = setTimeout(() => {
        void persistMeta(undefined, facts);
      }, 700);
    },
    [persistMeta]
  );

  useEffect(
    () => () => {
      if (factsSaveTimerRef.current) clearTimeout(factsSaveTimerRef.current);
    },
    []
  );

  const applyFactsToMaterials = useCallback(() => {
    if (!projectFacts) return;
    setApplyingFacts(true);
    try {
      setMaterials((prev) => applyProjectFactsToMaterialRows(prev, projectFacts, null));
      void persistMeta(undefined, projectFacts);
    } finally {
      setApplyingFacts(false);
    }
  }, [persistMeta, projectFacts]);

  const goToStep = (step: AiSetupStepId) => setActiveStep(step);

  const advanceFromMaterial = async () => {
    setSaving(true);
    setError(null);
    try {
      const synced = await syncMaterialRowsToQuoteItems(project.id, materials);
      setMaterials(synced);
      await persistMeta();
      setActiveStep("work");
    } catch (e) {
      setError(e instanceof Error ? e.message : t("projects.aiSetup.saveError"));
    } finally {
      setSaving(false);
    }
  };

  const advanceFromWork = async () => {
    setSaving(true);
    setError(null);
    try {
      const synced = await syncWorkEstimateToQuoteItems(
        project.id,
        workEstimate,
        t("projects.aiSetup.work.lineLabel")
      );
      setWorkEstimate(synced);
      await persistMeta();
      setActiveStep("price");
    } catch (e) {
      setError(e instanceof Error ? e.message : t("projects.aiSetup.saveError"));
    } finally {
      setSaving(false);
    }
  };

  const advanceFromPrice = async () => {
    setSaving(true);
    try {
      const frozen = freezeCalculationForSave(calculation, totals);
      setCalculation(frozen);
      await persistMeta(frozen);
      setActiveStep("offer");
    } catch (e) {
      setError(e instanceof Error ? e.message : t("projects.aiSetup.saveError"));
    } finally {
      setSaving(false);
    }
  };

  const saveQuoteDraft = async () => {
    setSaving(true);
    setError(null);
    try {
      const syncedMaterials = await syncMaterialRowsToQuoteItems(project.id, materials);
      setMaterials(syncedMaterials);
      const syncedWork = await syncWorkEstimateToQuoteItems(
        project.id,
        workEstimate,
        t("projects.aiSetup.work.lineLabel")
      );
      setWorkEstimate(syncedWork);

      const finalTotals = computeAiSetupTotals(syncedMaterials, syncedWork, calculation);
      const frozen = freezeCalculationForSave(calculation, finalTotals);
      setCalculation(frozen);

      const notes = serializeAiSetupMeta(
        { workEstimate: syncedWork, calculation: frozen },
        undefined,
        documentMeta
      );
      const updatedProject = await updateDraftJobFields(project.id, {
        quoteDraftVatPercent: frozen.vatPercent,
        quoteDraftNotes: notes,
      });
      onProjectUpdated(updatedProject);

      const statusUpdated = await updateDraftJobStatus(project.id, "quote_drafted", {
        salesStatus: "draft",
        quoteStatus: "draft",
      });
      onProjectUpdated(statusUpdated);

      setQuoteSaved(true);

      if (activeWorkspace) {
        try {
          const quoteId = await upsertQuoteFromProject(activeWorkspace, userId, project.id);
          setSavedQuoteId(quoteId);
        } catch (syncErr) {
          console.warn("[AiProjectSetup] quote sync failed:", syncErr);
          setError(
            syncErr instanceof Error
              ? `${t("projects.aiSetup.saveOkQuoteSyncFailed")} ${syncErr.message}`
              : t("projects.aiSetup.saveOkQuoteSyncFailed")
          );
        }
      }
    } catch (e) {
      const message = e instanceof Error ? e.message : t("projects.aiSetup.saveError");
      setError(message);
    } finally {
      setSaving(false);
    }
  };

  const exportPdf = async () => {
    setExportingPdf(true);
    setError(null);
    try {
      const syncedMaterials = await syncMaterialRowsToQuoteItems(project.id, materials);
      setMaterials(syncedMaterials);
      await syncWorkEstimateToQuoteItems(
        project.id,
        workEstimate,
        t("projects.aiSetup.work.lineLabel")
      );
      const finalTotals = computeAiSetupTotals(syncedMaterials, workEstimate, calculation);
      const frozen = freezeCalculationForSave(calculation, finalTotals);
      setCalculation(frozen);
      await persistMeta(frozen);
      window.open(`/app/projects/${project.id}/print?setup=ai`, "_blank", "noopener,noreferrer");
    } catch (e) {
      setError(e instanceof Error ? e.message : t("projects.aiSetup.saveError"));
    } finally {
      setExportingPdf(false);
    }
  };

  const customerLabel =
    project.customerCompanyName?.trim() ||
    project.customerName?.trim() ||
    t("projects.aiSetup.noCustomer");

  if (loading) {
    return <div className="py-16 text-center text-[#64748B]">{t("common.loading")}</div>;
  }

  return (
    <div className="space-y-6 -mx-1">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <Link
            href="/app/projects"
            className="inline-flex items-center gap-2 text-sm text-[#64748B] hover:text-[#0F2A4D] mb-2"
          >
            <ArrowLeft className="size-4" />
            {t("projects.titleJobs")}
          </Link>
          <div className="flex items-center gap-2 flex-wrap">
            <Sparkles className="size-5 text-[#E95F2A]" aria-hidden />
            <h1 className="text-xl sm:text-2xl font-bold text-[#0F2A4D]">
              {t("projects.aiSetup.pageTitle")}
            </h1>
          </div>
          <p className="text-sm text-[#64748B] mt-1">
            {project.name} · {customerLabel} ·{" "}
            <Badge variant="outline" className="ml-1 border-[#CBD5E1]">
              {t("projects.aiSetup.badgeDraft")}
            </Badge>
          </p>
        </div>
        <Link
          href={`/app/projects/${project.id}`}
          className="text-sm font-semibold text-[#64748B] hover:text-[#0F2A4D] underline-offset-2 hover:underline shrink-0"
        >
          {t("projects.aiSetup.openStandardDetail")}
        </Link>
      </div>

      <AiSetupStepper
        activeStep={activeStep}
        onStepClick={(step) => {
          const targetIndex = AI_SETUP_STEPS.indexOf(step);
          const currentIndex = AI_SETUP_STEPS.indexOf(activeStep);
          if (targetIndex <= currentIndex) setActiveStep(step);
        }}
      />

      {error ? (
        <div
          className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800"
          role="alert"
        >
          {error}
        </div>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(260px,320px)] lg:items-start">
        <div className="min-w-0 space-y-4">
          {activeStep === "material" || activeStep === "offer" ? (
            <AiSetupQualityGatePanel findings={qualityFindings} blocked={qualityBlocked} />
          ) : null}
          <div className="rounded-2xl border border-[#CBD5E1] bg-white p-4 sm:p-6 shadow-sm">
          {activeStep === "overview" ? (
            <AiSetupOverviewStep
              project={project}
              phaseCount={phaseCount}
              taskCount={taskCount}
              materialCount={materials.filter((m) => m.included).length}
              onContinue={() => goToStep("material")}
            />
          ) : null}
          {activeStep === "material" ? (
            <AiSetupMaterialStep
              materials={materials}
              onMaterialsChange={setMaterials}
              onContinue={() => void advanceFromMaterial()}
              saving={saving}
              loadingMaterials={loadingMaterials}
              projectFacts={projectFacts}
              onProjectFactsChange={handleProjectFactsChange}
              onApplyFactsToMaterials={applyFactsToMaterials}
              applyingFacts={applyingFacts}
              evidence={evidenceEnabled ? estimatorPositions : undefined}
              currency={currency}
              subTab={materialSubTab}
              onSubTabChange={setMaterialSubTab}
            />
          ) : null}
          {activeStep === "work" ? (
            <AiSetupWorkStep
              work={workEstimate}
              onChange={setWorkEstimate}
              onContinue={() => void advanceFromWork()}
              saving={saving}
              currency={currency}
            />
          ) : null}
          {activeStep === "price" ? (
            <AiSetupPriceStep
              calculation={calculation}
              totals={totals}
              onChange={setCalculation}
              onContinue={() => void advanceFromPrice()}
              saving={saving}
              currency={currency}
              pricingBlocked={productSourcingOn && !pricingReady.ok}
              pricingBlockReasons={pricingReady.missing}
              productSourcingSlot={
                productSourcingOn ? (
                  <div className="space-y-3">
                    {productMatchLoading ? (
                      <p className="text-sm text-[#64748B]">{t("common.loading")}</p>
                    ) : null}
                    {productMatchWarnings.length > 0 ? (
                      <ul className="text-xs text-[#64748B] list-disc pl-5 space-y-0.5">
                        {productMatchWarnings.map((w) => (
                          <li key={w}>{w}</li>
                        ))}
                      </ul>
                    ) : null}
                    <AiSetupProductSourcingPanel
                      selections={productSelections}
                      currency={currency}
                      onSelectProduct={handleSelectProduct}
                      onManualPrice={handleManualPrice}
                      onMarkCustomerSupplied={handleMarkCustomerSupplied}
                      onExclude={handleExcludeProduct}
                      preferencesHint={productPrefs.preferredBrands.length === 0}
                    />
                  </div>
                ) : undefined
              }
            />
          ) : null}
          {activeStep === "offer" ? (
            <AiSetupOfferStep
              project={project}
              materials={materials}
              work={workEstimate}
              totals={totals}
              documentMeta={documentMeta}
              onDocumentMetaChange={setDocumentMeta}
              onSaveDraft={() => void saveQuoteDraft()}
              onExportPdf={() => void exportPdf()}
              saving={saving}
              saved={quoteSaved}
              savedQuoteId={savedQuoteId}
              exportingPdf={exportingPdf}
              currency={currency}
              clarityErrors={clarity.errors}
              clarityWarnings={clarity.warnings}
              quoteReady={clarity.ok}
              quotePackageSections={quotePackage.sections.map((s) => ({
                title: s.titleSk,
                lineCount: s.lines.length,
              }))}
              purchaseListSlot={
                productSourcingOn ? (
                  <AiSetupPurchaseListPanel lines={purchaseList} currency={currency} />
                ) : undefined
              }
            />
          ) : null}
          </div>
        </div>

        <AiSetupSummaryPanel
          totals={totals}
          calculation={calculation}
          currency={currency}
          preliminary={!clarity.ok || totals.materialCost <= 0}
          priceMissingCount={missingPriceCount}
          onFillPrices={openMaterialPrices}
        />
      </div>
    </div>
  );
}
