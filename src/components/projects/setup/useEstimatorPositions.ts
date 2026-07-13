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
import {
  applyAnnotationSelection,
  applyCatalogPriceToPosition,
  applyManualPriceToPosition,
  applyPriceToSimilarPositions,
  buildPdfOverlayAnnotations,
  buildPositionsFromMaterialRows,
  confirmPosition,
  excludePositionFromQuote,
  ignorePosition,
  linkPositionsToMaterialRows,
  markPositionCustomerSupplied,
  positionsBlockFixedQuote,
  summarizeEstimatorPositions,
} from "@/lib/ai/estimatorPositions";
import type { EstimatorPosition } from "@/types/estimatorPositions";
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
  >
>;

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
}) {
  const { project, workspace, userId, materials, enabled } = input;
  const currency = input.currency ?? "EUR";
  const [positions, setPositions] = useState<EstimatorPosition[]>([]);
  const [selectedPositionId, setSelectedPositionId] = useState<string | null>(null);
  const [fileUrl, setFileUrl] = useState<string | null>(null);
  const [fileName, setFileName] = useState<string | undefined>(undefined);
  const [loading, setLoading] = useState(false);
  const sourceRef = useRef<"none" | "snapshot" | "fallback">("none");
  const overridesRef = useRef(new Map<string, UserOverride>());
  const persistedHashRef = useRef("");
  const persistTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

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
      } else {
        sourceRef.current = "fallback";
      }
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [enabled, sessionId, applyOverrides]);

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

  // Resolve the uploaded PDF for the interactive viewer.
  useEffect(() => {
    if (!enabled || !workspace) return;
    let cancelled = false;
    (async () => {
      try {
        const attachments = await resolveAiWizardAttachments(project, workspace, userId);
        const pdf =
          attachments.find((f) => f.mimeType === "application/pdf") ??
          attachments.find((f) => f.fileName.toLowerCase().endsWith(".pdf"));
        if (!pdf || cancelled) return;
        const url = await resolveAiDraftAttachmentUrl(pdf);
        if (cancelled) return;
        setFileUrl(url);
        setFileName(pdf.fileName);
      } catch {
        // PDF stays unavailable — the viewer shows a clear empty state.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [enabled, workspace, userId, project]);

  // Persist user review/price changes back to the session snapshot.
  useEffect(() => {
    if (!enabled || !sessionId || positions.length === 0) return;
    if (overridesRef.current.size === 0) return; // nothing user-made yet
    const hash = JSON.stringify(positions);
    if (hash === persistedHashRef.current) return;
    if (persistTimerRef.current) clearTimeout(persistTimerRef.current);
    persistTimerRef.current = setTimeout(() => {
      persistedHashRef.current = hash;
      void saveEstimatorPositionsSnapshot({
        sessionId,
        orgId,
        projectId: project.id,
        positions,
        pdfOverlayAnnotations: buildPdfOverlayAnnotations(positions),
      });
    }, 1200);
    return () => {
      if (persistTimerRef.current) clearTimeout(persistTimerRef.current);
    };
  }, [enabled, sessionId, orgId, project.id, positions]);

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
    });
  }, []);

  const replacePosition = useCallback(
    (next: EstimatorPosition) => {
      recordOverride(next);
      setPositions((prev) => prev.map((p) => (p.id === next.id ? next : p)));
    },
    [recordOverride]
  );

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
    (position: EstimatorPosition, reason: string) =>
      replacePosition(ignorePosition(position, reason)),
    [replacePosition]
  );

  const exclude = useCallback(
    (position: EstimatorPosition, reason: string) =>
      replacePosition(excludePositionFromQuote(position, reason)),
    [replacePosition]
  );

  const applyManualPrice = useCallback(
    (position: EstimatorPosition, unitPrice: number, applySimilar: boolean) => {
      const priced = applyManualPriceToPosition(position, unitPrice, currency);
      if (priced.priceStatus !== "manual_price") return; // 0 € rejected
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

  const annotations = useMemo(
    () => applyAnnotationSelection(buildPdfOverlayAnnotations(positions), selectedPositionId),
    [positions, selectedPositionId]
  );

  const summary = useMemo(() => summarizeEstimatorPositions(positions), [positions]);
  const quoteSafety = useMemo(() => positionsBlockFixedQuote(positions), [positions]);

  return {
    positions,
    annotations,
    summary,
    quoteSafety,
    loading,
    fileUrl,
    fileName,
    selectedPositionId,
    setSelectedPositionId,
    confirm,
    ignore,
    exclude,
    applyManualPrice,
    applyCatalogPrice,
    customerSupplied,
  };
}
