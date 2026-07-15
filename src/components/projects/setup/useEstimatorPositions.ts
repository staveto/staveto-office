"use client";

/**
 * Evidence-linked takeoff positions for the AI setup workspace.
 *
 * Loads persisted positions from estimatorSessions/{sessionId} (written by
 * the estimator review flow) and falls back to positions built from the
 * editable material rows. Keeps the PDF viewer, the linked table and the
 * price drawer in sync, and persists user review/price actions back to the
 * session snapshot (sanitized, additive merge).
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ProjectDoc } from "@/lib/projects";
import type { ActiveWorkspace } from "@/types/workspace";
import { isAiMultiDocumentEstimatorEnabled } from "@/lib/ai/aiEstimatorFeature";
import {
  buildEstimatorDocumentsFromAttachments,
  filterAnnotationsForDocument,
  hydrateEstimatorDocuments,
  pickDefaultDrawingDocument,
  pdfDocuments,
} from "@/lib/ai/estimatorDocuments";
import { isScheduleOnlySession } from "@/lib/ai/estimatorMultiDocumentBuild";
import { resolveSelectionTarget } from "@/lib/ai/mergeEstimatorPositionsFromDocuments";
import {
  addManualMarkToPosition,
  addSimilarCandidateMarksToPosition,
  addAndConfirmSimilarMarksToPosition,
  applyAnnotationSelection,
  applyCatalogPriceToPosition,
  applyManualPriceToPosition,
  applyMarkCountAsQuantity,
  applyPriceToSimilarPositions,
  buildPdfOverlayAnnotations,
  buildPositionsFromMaterialRows,
  confirmPosition,
  excludePositionFromQuote,
  ignorePosition,
  linkPositionsToMaterialRows,
  markPositionCustomerSupplied,
  positionsBlockFixedQuote,
  removeManualMarkFromPosition,
  renamePositionLabel,
  setPositionCategory,
  summarizeEstimatorPositions,
  summarizeMarkingProgress,
  confirmSimilarCandidateMarks,
  removeSimilarCandidateMarks,
} from "@/lib/ai/estimatorPositions";
import {
  createPositionFromSymbolDraft,
  type SymbolDraftClassification,
} from "@/lib/ai/unclassifiedSymbolDraft";
import type {
  EstimatorDocument,
  EstimatorPositionBBox,
  EstimatorPosition,
  EstimatorQuantityConflict,
  UnclassifiedSymbolDraft,
} from "@/types/estimatorPositions";
import {
  loadEstimatorPositionsSnapshot,
  saveEstimatorPositionsSnapshot,
} from "@/services/estimatorKnowledge/estimatorSessionService";
import { resolveAiWizardAttachments } from "@/services/projects/projectAiAttachmentsService";
import { resolveAiDraftAttachmentUrl } from "@/lib/ai/aiDraftAttachmentPreview";
import type { CatalogPriceChoice } from "@/components/ai-estimator/EstimatorPriceDrawer";
import type { AiSetupMaterialRow } from "./aiSetupTypes";

type UserOverride = Partial<
  Pick<
    EstimatorPosition,
    | "reviewStatus"
    | "reviewReason"
    | "priceStatus"
    | "unitPrice"
    | "totalPrice"
    | "currency"
    | "productRef"
    | "evidenceAnchors"
    | "label"
    | "quantity"
    | "unit"
    | "quantitySource"
    | "category"
    | "normalizedPoint"
  >
>;

export type ConflictResolution = "drawing" | "schedule" | "manual" | "exclude";

export type EstimatorPositionsApi = ReturnType<typeof useEstimatorPositions>;

export function useEstimatorPositions(input: {
  project: ProjectDoc;
  workspace: ActiveWorkspace | null;
  userId: string;
  materials: AiSetupMaterialRow[];
  currency?: string;
  enabled: boolean;
  /** Sync an applied price back into the editable material row (quote totals). */
  onMaterialPriceApplied?: (materialRowId: string, unitPrice: number) => void;
  /** Soft-remove linked material from quote when position is ignored/excluded. */
  onMaterialRowExcluded?: (materialRowId: string) => void;
}) {
  const { project, workspace, userId, materials, enabled } = input;
  const currency = input.currency ?? "EUR";
  const multiDocEnabled = isAiMultiDocumentEstimatorEnabled();

  const [positions, setPositions] = useState<EstimatorPosition[]>([]);
  const [documents, setDocuments] = useState<EstimatorDocument[]>([]);
  const [activeDocumentId, setActiveDocumentId] = useState<string | null>(null);
  const [conflicts, setConflicts] = useState<EstimatorQuantityConflict[]>([]);
  const [selectedPositionId, setSelectedPositionId] = useState<string | null>(null);
  const [selectedAnchorId, setSelectedAnchorId] = useState<string | null>(null);
  const [fileUrl, setFileUrl] = useState<string | null>(null);
  const [fileName, setFileName] = useState<string | undefined>(undefined);
  const [loading, setLoading] = useState(false);
  const sourceRef = useRef<"none" | "snapshot" | "fallback">("none");
  const overridesRef = useRef(new Map<string, UserOverride>());
  const persistedHashRef = useRef("");
  const persistTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const positionsRef = useRef(positions);
  positionsRef.current = positions;
  const documentsRef = useRef(documents);
  documentsRef.current = documents;
  const conflictsRef = useRef(conflicts);
  conflictsRef.current = conflicts;
  const documentsPersistedRef = useRef(false);

  const sessionId = project.aiEstimatorSessionId?.trim() || "";
  const orgId = workspace?.orgId ?? userId;

  const materialRowsForBuild = useMemo(
    () =>
      materials.map((m) => ({
        id: m.id,
        name: m.name,
        qty: m.qty,
        unit: m.unit,
        price: m.price,
        included: m.included,
        confidence: m.confidence,
        group: m.group,
        sourceNote: m.sourceNote,
      })),
    [materials]
  );

  const scheduleOnly = useMemo(
    () => multiDocEnabled && isScheduleOnlySession(documents),
    [multiDocEnabled, documents]
  );

  // Tag positions with document ids from active file context when missing.
  useEffect(() => {
    if (!multiDocEnabled || documents.length === 0 || positions.length === 0) return;
    const needsTag = positions.some(
      (p) =>
        p.evidenceAnchors.some((a) => !a.documentId) ||
        !(p.sourceDocuments?.length)
    );
    if (!needsTag) return;

    setPositions((prev) =>
      prev.map((p) => {
        const taggedAnchors = p.evidenceAnchors.map((a) => {
          if (a.documentId) return a;
          const doc =
            documents.find((d) => d.fileName === a.fileName) ??
            documents.find((d) => d.fileId === a.fileId);
          return doc ? { ...a, documentId: doc.id } : a;
        });
        const sourceDocs = [
          ...new Set([
            ...(p.sourceDocuments ?? []),
            ...taggedAnchors.map((a) => a.documentId).filter(Boolean) as string[],
          ]),
        ];
        return { ...p, evidenceAnchors: taggedAnchors, sourceDocuments: sourceDocs };
      })
    );
  }, [multiDocEnabled, documents, positions.length]);

  const activeDocument = useMemo(
    () => documents.find((d) => d.id === activeDocumentId) ?? null,
    [documents, activeDocumentId]
  );

  const applyOverrides = useCallback((list: EstimatorPosition[]): EstimatorPosition[] => {
    if (overridesRef.current.size === 0) return list;
    return list.map((p) => {
      const o = overridesRef.current.get(p.positionCode);
      return o ? { ...p, ...o } : p;
    });
  }, []);

  // Initial load: session snapshot first, material fallback otherwise.
  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    setLoading(true);
    (async () => {
      const snapshot = sessionId ? await loadEstimatorPositionsSnapshot(sessionId) : null;
      if (cancelled) return;
      if (snapshot && snapshot.positions.length > 0) {
        sourceRef.current = "snapshot";
        setPositions(applyOverrides(snapshot.positions));
        if (multiDocEnabled && snapshot.conflicts?.length) {
          setConflicts(snapshot.conflicts);
        }
      } else {
        sourceRef.current = "fallback";
      }
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [enabled, sessionId, applyOverrides, multiDocEnabled]);

  // Fallback build + material row price linking.
  useEffect(() => {
    if (!enabled || loading) return;
    if (sourceRef.current === "fallback") {
      const built = buildPositionsFromMaterialRows(materialRowsForBuild, {
        fileName: fileName ?? "podklad.pdf",
        trade: "electrical",
        currency,
      });
      setPositions(applyOverrides(built));
    } else if (sourceRef.current === "snapshot") {
      setPositions((prev) => applyOverrides(linkPositionsToMaterialRows(prev, materialRowsForBuild)));
    }
  }, [enabled, loading, materialRowsForBuild, fileName, currency, applyOverrides]);

  // Resolve uploaded files for viewer (single-PDF or multi-document).
  useEffect(() => {
    if (!enabled || !workspace) return;
    let cancelled = false;
    (async () => {
      try {
        const attachments = await resolveAiWizardAttachments(project, workspace, userId);
        if (cancelled || attachments.length === 0) return;

        const urlByFileId = new Map<string, string>();
        await Promise.all(
          attachments.map(async (file) => {
            try {
              const url = await resolveAiDraftAttachmentUrl(file);
              if (url) urlByFileId.set(file.id, url);
            } catch {
              /* skip unreachable files */
            }
          })
        );

        if (multiDocEnabled) {
          const built = buildEstimatorDocumentsFromAttachments(attachments, urlByFileId);
          const snapshot = sessionId ? await loadEstimatorPositionsSnapshot(sessionId) : null;
          const hydrated = hydrateEstimatorDocuments(snapshot?.documents, built);
          setDocuments(hydrated);
          documentsPersistedRef.current = false;

          const defaultDoc = pickDefaultDrawingDocument(pdfDocuments(hydrated));
          setActiveDocumentId((prev) => prev ?? defaultDoc?.id ?? hydrated[0]?.id ?? null);

          if (defaultDoc?.fileUrl) {
            setFileUrl(defaultDoc.fileUrl);
            setFileName(defaultDoc.fileName);
          }
        } else {
          const pdf =
            attachments.find((f) => f.mimeType === "application/pdf") ??
            attachments.find((f) => f.fileName.toLowerCase().endsWith(".pdf"));
          if (!pdf) return;
          const url = urlByFileId.get(pdf.id) ?? (await resolveAiDraftAttachmentUrl(pdf));
          if (cancelled) return;
          setFileUrl(url);
          setFileName(pdf.fileName);
        }
      } catch {
        // PDF stays unavailable — the viewer shows a clear empty state.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [enabled, workspace, userId, project, multiDocEnabled, sessionId]);

  // Sync fileUrl/fileName when active document changes (multi-doc).
  useEffect(() => {
    if (!multiDocEnabled || !activeDocument) return;
    if (activeDocument.fileUrl) {
      setFileUrl(activeDocument.fileUrl);
      setFileName(activeDocument.fileName);
    }
  }, [multiDocEnabled, activeDocument]);

  // Persist user review/price changes back to the session snapshot.
  useEffect(() => {
    if (!enabled || !sessionId || positions.length === 0) return;
    const shouldPersistDocuments =
      multiDocEnabled && documents.length > 0 && !documentsPersistedRef.current;
    if (
      overridesRef.current.size === 0 &&
      conflicts.length === 0 &&
      !shouldPersistDocuments
    ) {
      return;
    }
    const hash = JSON.stringify({ positions, conflicts, documents });
    if (hash === persistedHashRef.current) return;
    if (persistTimerRef.current) clearTimeout(persistTimerRef.current);
    persistTimerRef.current = setTimeout(() => {
      persistedHashRef.current = hash;
      if (multiDocEnabled && documents.length > 0) {
        documentsPersistedRef.current = true;
      }
      void saveEstimatorPositionsSnapshot({
        sessionId,
        orgId,
        projectId: project.id,
        positions,
        pdfOverlayAnnotations: buildPdfOverlayAnnotations(positions),
        documents: multiDocEnabled && documents.length ? documents : undefined,
        conflicts: multiDocEnabled && conflicts.length ? conflicts : undefined,
      });
    }, 1200);
    return () => {
      if (persistTimerRef.current) clearTimeout(persistTimerRef.current);
    };
  }, [enabled, sessionId, orgId, project.id, positions, conflicts, documents, multiDocEnabled]);

  const recordOverride = useCallback((next: EstimatorPosition) => {
    overridesRef.current.set(next.positionCode, {
      reviewStatus: next.reviewStatus,
      reviewReason: next.reviewReason,
      priceStatus: next.priceStatus,
      unitPrice: next.unitPrice,
      totalPrice: next.totalPrice,
      currency: next.currency,
      productRef: next.productRef,
      evidenceAnchors: next.evidenceAnchors,
      label: next.label,
      quantity: next.quantity,
      unit: next.unit,
      quantitySource: next.quantitySource,
      category: next.category,
      normalizedPoint: next.normalizedPoint,
    });
  }, []);

  const selectPosition = useCallback(
    (id: string | null) => {
      setSelectedPositionId(id);
      setSelectedAnchorId(null);
      if (!id || !multiDocEnabled) return;
      const pos = positionsRef.current.find((p) => p.id === id);
      if (!pos) return;
      const target = resolveSelectionTarget(pos, documentsRef.current);
      if (target.documentId) setActiveDocumentId(target.documentId);
    },
    [multiDocEnabled]
  );

  const setActiveDocument = useCallback((documentId: string) => {
    setActiveDocumentId(documentId);
    setSelectedAnchorId(null);
  }, []);

  const replacePosition = useCallback(
    (next: EstimatorPosition) => {
      recordOverride(next);
      setPositions((prev) => prev.map((p) => (p.id === next.id ? next : p)));
    },
    [recordOverride]
  );

  const resolveConflict = useCallback(
    (
      conflictId: string,
      resolution: ConflictResolution,
      manualQty?: number,
      note?: string
    ) => {
      const conflict = conflictsRef.current.find((c) => c.id === conflictId);
      if (!conflict) return;

      setConflicts((prev) =>
        prev.map((c) => {
          if (c.id !== conflictId) return c;
          const status =
            resolution === "drawing"
              ? "resolved_drawing"
              : resolution === "schedule"
                ? "resolved_schedule"
                : resolution === "manual"
                  ? "resolved_manual"
                  : "excluded";
          return { ...c, status, note: note ?? c.note };
        })
      );

      setPositions((prev) =>
        prev.map((p) => {
          if (p.id !== conflict.positionId) return p;
          if (resolution === "exclude") {
            const next = excludePositionFromQuote(
              p,
              note ?? "Vylúčené kvôli rozdielu medzi dokumentmi."
            );
            recordOverride(next);
            return next;
          }
          let quantity = p.quantity;
          let quantitySource = p.quantitySource;
          if (resolution === "drawing" && conflict.drawingQty != null) {
            quantity = conflict.drawingQty;
            quantitySource = "drawing_detection";
          } else if (resolution === "schedule" && conflict.scheduleQty != null) {
            quantity = conflict.scheduleQty;
            quantitySource = "schedule";
          } else if (resolution === "manual" && manualQty != null && manualQty > 0) {
            quantity = manualQty;
            quantitySource = "manual";
          }
          const next: EstimatorPosition = {
            ...p,
            quantity,
            quantitySource,
            reviewStatus: "confirmed",
            reviewReason: note,
            note: note ?? p.note,
          };
          recordOverride(next);
          return next;
        })
      );
    },
    [recordOverride]
  );

  const saveConflictNote = useCallback((conflictId: string, note: string) => {
    setConflicts((prev) =>
      prev.map((c) => (c.id === conflictId ? { ...c, note: note.trim() || c.note } : c))
    );
  }, []);

  const syncMaterialPrice = useCallback(
    (position: EstimatorPosition, unitPrice: number) => {
      if (position.linkedMaterialRowId && unitPrice > 0) {
        input.onMaterialPriceApplied?.(position.linkedMaterialRowId, unitPrice);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [input.onMaterialPriceApplied]
  );

  const confirm = useCallback(
    (position: EstimatorPosition) => replacePosition(confirmPosition(position)),
    [replacePosition]
  );

  const ignore = useCallback(
    (position: EstimatorPosition, reason: string) => {
      replacePosition(ignorePosition(position, reason));
      if (position.linkedMaterialRowId) {
        input.onMaterialRowExcluded?.(position.linkedMaterialRowId);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [replacePosition, input.onMaterialRowExcluded]
  );

  const exclude = useCallback(
    (position: EstimatorPosition, reason: string) => {
      replacePosition(excludePositionFromQuote(position, reason));
      if (position.linkedMaterialRowId) {
        input.onMaterialRowExcluded?.(position.linkedMaterialRowId);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [replacePosition, input.onMaterialRowExcluded]
  );

  const applyManualPrice = useCallback(
    (position: EstimatorPosition, unitPrice: number, applySimilar: boolean) => {
      const priced = applyManualPriceToPosition(position, unitPrice, currency);
      if (priced.priceStatus !== "manual_price") return;
      setPositions((prev) => {
        const next = applySimilar
          ? applyPriceToSimilarPositions(prev, priced)
          : prev.map((p) => (p.id === priced.id ? priced : p));
        for (const p of next) {
          if (p.unitPrice !== prev.find((x) => x.id === p.id)?.unitPrice) {
            recordOverride(p);
            syncMaterialPrice(p, p.unitPrice ?? 0);
          }
        }
        return next;
      });
    },
    [currency, recordOverride, syncMaterialPrice]
  );

  const applyCatalogPrice = useCallback(
    (position: EstimatorPosition, price: CatalogPriceChoice, applySimilar: boolean) => {
      const priced = applyCatalogPriceToPosition(position, price);
      if (priced.unitPrice == null) return;
      setPositions((prev) => {
        const next = applySimilar
          ? applyPriceToSimilarPositions(prev, priced)
          : prev.map((p) => (p.id === priced.id ? priced : p));
        for (const p of next) {
          if (p.unitPrice !== prev.find((x) => x.id === p.id)?.unitPrice) {
            recordOverride(p);
            syncMaterialPrice(p, p.unitPrice ?? 0);
          }
        }
        return next;
      });
    },
    [recordOverride, syncMaterialPrice]
  );

  const customerSupplied = useCallback(
    (position: EstimatorPosition) =>
      replacePosition(markPositionCustomerSupplied(position)),
    [replacePosition]
  );

  const addManualMark = useCallback(
    (
      positionId: string,
      page: number,
      bbox: EstimatorPositionBBox,
      polygon?: Array<{ x: number; y: number }>,
      meta?: {
        rawSelectionBbox: EstimatorPositionBBox;
        tightSymbolBbox?: EstimatorPositionBBox;
        outsidePlan?: boolean;
        needsReview?: boolean;
        markStatus?:
          | "confirmed"
          | "outside_plan"
          | "needs_review"
          | "inside_plan"
          | "boundary_uncertain"
          | "in_legend_or_table";
        cropId?: string;
      }
    ) => {
      setPositions((prev) =>
        prev.map((p) => {
          if (p.id !== positionId) return p;
          const next = addManualMarkToPosition(p, {
            page,
            bbox,
            polygon,
            fileName: fileName ?? "podklad.pdf",
            documentId: activeDocument?.id,
            fileId: activeDocument?.fileId,
            rawSelectionBbox: meta?.rawSelectionBbox ?? bbox,
            tightSymbolBbox: meta?.tightSymbolBbox,
            markStatus:
              meta?.markStatus ??
              (meta?.outsidePlan
                ? "outside_plan"
                : meta?.needsReview
                  ? "needs_review"
                  : "confirmed"),
            needsReview: meta?.needsReview ?? meta?.outsidePlan,
            cropId: meta?.cropId,
          });
          recordOverride(next);
          return next;
        })
      );
    },
    [fileName, activeDocument, recordOverride]
  );

  const addSimilarCandidateMarks = useCallback(
    (
      positionId: string,
      marks: Array<{
        page: number;
        bbox: EstimatorPositionBBox;
        matchScore: number;
      }>
    ) => {
      setPositions((prev) =>
        prev.map((p) => {
          if (p.id !== positionId) return p;
          const next = addSimilarCandidateMarksToPosition(
            p,
            marks.map((m) => ({
              ...m,
              fileName: fileName ?? "podklad.pdf",
              documentId: activeDocument?.id,
              fileId: activeDocument?.fileId,
            }))
          );
          if (next !== p) recordOverride(next);
          return next;
        })
      );
    },
    [fileName, activeDocument, recordOverride]
  );

  /** Find-similar path: add matches and bump quantity in one state update. */
  const addAndConfirmSimilarMarks = useCallback(
    (
      positionId: string,
      marks: Array<{
        page: number;
        bbox: EstimatorPositionBBox;
        matchScore: number;
      }>
    ) => {
      setPositions((prev) =>
        prev.map((p) => {
          if (p.id !== positionId) return p;
          const next = addAndConfirmSimilarMarksToPosition(
            p,
            marks.map((m) => ({
              ...m,
              fileName: fileName ?? "podklad.pdf",
              documentId: activeDocument?.id,
              fileId: activeDocument?.fileId,
            }))
          );
          if (next !== p) recordOverride(next);
          return next;
        })
      );
    },
    [fileName, activeDocument, recordOverride]
  );

  const createPositionFromDraft = useCallback(
    (
      draft: UnclassifiedSymbolDraft,
      classification: SymbolDraftClassification
    ): EstimatorPosition => {
      const { position } = createPositionFromSymbolDraft(
        draft,
        classification,
        positionsRef.current,
        {
          fileName: fileName ?? "podklad.pdf",
          documentId: activeDocument?.id,
          fileId: activeDocument?.fileId,
        }
      );
      recordOverride(position);
      setPositions((prev) => [...prev, position]);
      // Do not keep selection — next PDF click must start a new symbol type.
      setSelectedPositionId(null);
      setSelectedAnchorId(null);
      return position;
    },
    [fileName, activeDocument, recordOverride]
  );

  const confirmSimilarCandidates = useCallback(
    (positionId: string) => {
      setPositions((prev) =>
        prev.map((p) => {
          if (p.id !== positionId) return p;
          const next = confirmSimilarCandidateMarks(p);
          if (next !== p) recordOverride(next);
          return next;
        })
      );
    },
    [recordOverride]
  );

  const dismissSimilarCandidates = useCallback(
    (positionId: string) => {
      setPositions((prev) =>
        prev.map((p) => {
          if (p.id !== positionId) return p;
          const next = removeSimilarCandidateMarks(p);
          if (next !== p) recordOverride(next);
          return next;
        })
      );
    },
    [recordOverride]
  );

  const removeManualMark = useCallback(
    (positionId: string, anchorId?: string) => {
      setPositions((prev) =>
        prev.map((p) => {
          if (p.id !== positionId) return p;
          const next = removeManualMarkFromPosition(p, anchorId);
          recordOverride(next);
          return next;
        })
      );
    },
    [recordOverride]
  );

  const renameLabel = useCallback(
    (positionId: string, label: string) => {
      setPositions((prev) =>
        prev.map((p) => {
          if (p.id !== positionId) return p;
          const next = renamePositionLabel(p, label);
          if (next !== p) recordOverride(next);
          return next;
        })
      );
    },
    [recordOverride]
  );

  const useMarkCountAsQuantity = useCallback(
    (positionId: string) => {
      setPositions((prev) =>
        prev.map((p) => {
          if (p.id !== positionId) return p;
          const next = applyMarkCountAsQuantity(p);
          if (next !== p) recordOverride(next);
          return next;
        })
      );
    },
    [recordOverride]
  );

  const setCategory = useCallback(
    (positionId: string, category: string) => {
      setPositions((prev) =>
        prev.map((p) => {
          if (p.id !== positionId) return p;
          const next = setPositionCategory(p, category);
          if (next !== p) recordOverride(next);
          return next;
        })
      );
    },
    [recordOverride]
  );

  const allAnnotations = useMemo(
    () => buildPdfOverlayAnnotations(positions),
    [positions]
  );

  const documentAnnotations = useMemo(() => {
    const base =
      multiDocEnabled && activeDocument
        ? filterAnnotationsForDocument(allAnnotations, positions, activeDocument)
        : allAnnotations;
    return applyAnnotationSelection(base, selectedPositionId, selectedAnchorId);
  }, [
    allAnnotations,
    positions,
    multiDocEnabled,
    activeDocument,
    selectedPositionId,
    selectedAnchorId,
  ]);

  const summary = useMemo(() => summarizeEstimatorPositions(positions), [positions]);
  const quoteSafety = useMemo(
    () => positionsBlockFixedQuote(positions, { openConflicts: conflicts }),
    [positions, conflicts]
  );
  const markingProgress = useMemo(() => summarizeMarkingProgress(positions), [positions]);

  return {
    positions,
    annotations: documentAnnotations,
    summary,
    quoteSafety,
    markingProgress,
    loading,
    fileUrl,
    fileName,
    projectId: project.id,
    multiDocEnabled,
    scheduleOnly,
    documents,
    activeDocumentId,
    activeDocument,
    setActiveDocumentId: setActiveDocument,
    conflicts,
    resolveConflict,
    saveConflictNote,
    selectedPositionId,
    setSelectedPositionId: selectPosition,
    selectedAnchorId,
    setSelectedAnchorId,
    confirm,
    ignore,
    exclude,
    applyManualPrice,
    applyCatalogPrice,
    customerSupplied,
    addManualMark,
    addSimilarCandidateMarks,
    addAndConfirmSimilarMarks,
    createPositionFromDraft,
    confirmSimilarCandidates,
    dismissSimilarCandidates,
    removeManualMark,
    renameLabel,
    useMarkCountAsQuantity,
    setCategory,
  };
}
