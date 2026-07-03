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
import { parseQuoteDocumentMeta, type QuoteDocumentMeta } from "@/lib/quoteDocumentMeta";
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
    parseQuoteDocumentMeta(project.quoteDraftNotes)
  );
  const [projectFacts, setProjectFacts] = useState<AiProjectFactsPersisted | undefined>();
  const [applyingFacts, setApplyingFacts] = useState(false);
  const factsSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

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
        setDocumentMeta(parseQuoteDocumentMeta(project.quoteDraftNotes));
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
  }, [project.id, project.aiDraftId, project.quoteDraftNotes, activeWorkspace, userId, countryCode, t]);

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
        <div className="min-w-0 rounded-2xl border border-[#CBD5E1] bg-white p-4 sm:p-6 shadow-sm">
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
              projectFacts={projectFacts}
              onProjectFactsChange={handleProjectFactsChange}
              onApplyFactsToMaterials={applyFactsToMaterials}
              applyingFacts={applyingFacts}
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
            />
          ) : null}
        </div>

        <AiSetupSummaryPanel totals={totals} calculation={calculation} currency={currency} />
      </div>
    </div>
  );
}
