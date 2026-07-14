/**
 * Copy the pdf.js worker matching the installed pdfjs-dist version into
 * public/ so it is served statically (see src/lib/takeoff/loadPdfJsDocument.ts).
 * Runs on postinstall to keep API and worker versions in sync.
 */
import { copyFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.dirname(fileURLToPath(import.meta.url));
const src = path.join(root, "..", "node_modules", "pdfjs-dist", "build", "pdf.worker.min.mjs");
const dest = path.join(root, "..", "public", "pdf.worker.min.mjs");

if (existsSync(src)) {
  copyFileSync(src, dest);
  console.log("[copy-pdf-worker] copied pdf.worker.min.mjs to public/");
} else {
  console.warn("[copy-pdf-worker] pdfjs-dist worker not found, skipping");
}
