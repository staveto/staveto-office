"use client";

/**
 * Dev self-test for the plan-marking interactions (no auth, no Firebase).
 *
 * Mounts EstimatorPdfEvidenceViewer with a locally generated PDF in mark
 * mode and reports every onMarkPlaced call. A Playwright script clicks and
 * drags over the canvas to verify point marks and freehand shapes.
 * Visit /marking-test in dev.
 */

import { useEffect, useMemo, useState } from "react";
import { EstimatorPdfEvidenceViewer } from "@/components/ai-estimator/EstimatorPdfEvidenceViewer";
import type {
  EstimatorPositionBBox,
  PdfOverlayAnnotation,
} from "@/types/estimatorPositions";

type PlacedMark = {
  page: number;
  bbox: EstimatorPositionBBox;
  polygon?: Array<{ x: number; y: number }>;
};

export default function MarkingSelfTestPage() {
  const [fileUrl, setFileUrl] = useState<string | null>(null);
  const [marks, setMarks] = useState<PlacedMark[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let url: string | null = null;
    (async () => {
      try {
        const { PDFDocument, StandardFonts } = await import("pdf-lib");
        const doc = await PDFDocument.create();
        const page = doc.addPage([600, 400]);
        const font = await doc.embedFont(StandardFonts.Helvetica);
        page.drawText("Marking self-test plan", { x: 40, y: 200, size: 18, font });
        const bytes = await doc.save();
        url = URL.createObjectURL(
          new Blob([bytes.buffer as ArrayBuffer], { type: "application/pdf" })
        );
        setFileUrl(url);
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      }
    })();
    return () => {
      if (url) URL.revokeObjectURL(url);
    };
  }, []);

  const annotations = useMemo<PdfOverlayAnnotation[]>(
    () =>
      marks.map((m, i) => ({
        id: `ann_test_${i}`,
        evidenceAnchorId: `anchor_test_${i}`,
        positionId: "pos_TEST",
        page: m.page,
        bbox: m.bbox,
        polygon: m.polygon,
        isManualMark: true,
        label: `M-${i + 1}`,
        colorKey: "socket",
        needsReview: false,
      })),
    [marks]
  );

  const summary = marks
    .map(
      (m, i) =>
        `#${i + 1} page=${m.page} bbox=${m.bbox.x.toFixed(3)},${m.bbox.y.toFixed(3)},${m.bbox.width.toFixed(3)},${m.bbox.height.toFixed(3)} poly=${m.polygon ? m.polygon.length : 0}`
    )
    .join(" | ");

  return (
    <main style={{ padding: 16, fontFamily: "monospace" }}>
      <h1 data-testid="marking-test-status">
        {error
          ? `MARKING_FAIL ${error}`
          : fileUrl
            ? `MARKING_READY marks=${marks.length}${summary ? ` :: ${summary}` : ""}`
            : "generating…"}
      </h1>
      <div style={{ maxWidth: 720 }}>
        <EstimatorPdfEvidenceViewer
          fileUrl={fileUrl}
          fileName="marking-test.pdf"
          annotations={annotations}
          selectedPositionId="pos_TEST"
          markMode
          onMarkPlaced={(page, bbox, polygon) =>
            setMarks((prev) => [...prev, { page, bbox, polygon }])
          }
          onMarkDeleted={() => setMarks((prev) => prev.slice(0, -1))}
          heightClassName="h-[420px]"
        />
      </div>
    </main>
  );
}
