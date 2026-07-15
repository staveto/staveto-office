"use client";

/**
 * Dev self-test for pdf.js rendering (no auth, no Firebase).
 *
 * Generates a one-page PDF in the browser with pdf-lib, then renders it via
 * pdf.js using the same worker setup as the real viewers. If this page shows
 * PDFJS_OK, pdf.js + worker are healthy and any viewer failure is caused by
 * the file URL (storage/CORS). Visit /pdf-test in dev to check.
 */

import { useEffect, useRef, useState } from "react";
import { pdfJsWorkerSrc } from "@/lib/takeoff/loadPdfJsDocument";

export default function PdfSelfTestPage() {
  const [status, setStatus] = useState("running…");
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const ranRef = useRef(false);

  useEffect(() => {
    if (ranRef.current) return;
    ranRef.current = true;
    (async () => {
      try {
        const { PDFDocument, StandardFonts } = await import("pdf-lib");
        const doc = await PDFDocument.create();
        const page = doc.addPage([300, 200]);
        const font = await doc.embedFont(StandardFonts.Helvetica);
        page.drawText("Staveto PDF self-test", { x: 40, y: 100, size: 14, font });
        const bytes = await doc.save();

        const pdfjs = await import("pdfjs-dist");
        pdfjs.GlobalWorkerOptions.workerSrc = pdfJsWorkerSrc();
        const loaded = await pdfjs.getDocument({ data: bytes }).promise;
        const pdfPage = await loaded.getPage(1);
        const viewport = pdfPage.getViewport({ scale: 2 });
        const canvas = canvasRef.current;
        if (canvas) {
          canvas.width = viewport.width;
          canvas.height = viewport.height;
          const ctx = canvas.getContext("2d");
          if (ctx) {
            await pdfPage.render({ canvas, canvasContext: ctx, viewport }).promise;
          }
        }
        setStatus(`PDFJS_OK pages=${loaded.numPages} worker=${pdfJsWorkerSrc()}`);
      } catch (err) {
        setStatus(
          `PDFJS_FAIL ${err instanceof Error ? `${err.name}: ${err.message}` : String(err)}`
        );
      }
    })();
  }, []);

  return (
    <main style={{ padding: 24, fontFamily: "monospace" }}>
      <h1 data-testid="pdf-test-status">{status}</h1>
      <canvas ref={canvasRef} style={{ border: "1px solid #ccc", maxWidth: "100%" }} />
    </main>
  );
}
