/**
 * npm run takeoff:doctor
 *
 * Node-side Takeoff Dependency Doctor (package + feature inventory).
 * Live Firebase probes run in /app/dev/takeoff-doctor UI when signed in.
 */

import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");

function inventoryFromPackageJson(deps) {
  const has = (name) => Boolean(deps[name]);
  return {
    pdfjsDist: has("pdfjs-dist"),
    sharp: has("sharp"),
    firebase: has("firebase"),
    firebaseAdmin: has("firebase-admin"),
    tesseractJs: has("tesseract.js"),
    opencvJs: has("opencv.js") || has("@techstark/opencv-js") || has("opencv4nodejs"),
    pgClient: has("pg"),
    pgvectorClient: has("pgvector"),
    azureDocumentIntelligence:
      has("@azure-rest/ai-document-intelligence") || has("@azure/ai-form-recognizer"),
  };
}

async function probeSharp() {
  try {
    const sharp = (await import("sharp")).default;
    await sharp({
      create: {
        width: 2,
        height: 2,
        channels: 3,
        background: { r: 0, g: 255, b: 0 },
      },
    })
      .png()
      .toBuffer();
    return true;
  } catch {
    return false;
  }
}

/** Mirrors src/lib/takeoff/takeoffDependencyDoctor.ts — keep in sync. */
function buildReport({ packages: p, features: f }) {
  const checks = [];
  const push = (id, category, label, status, detail, fixHint) => {
    checks.push({ id, category, label, status, detail, fixHint });
  };

  push(
    "pkg.pdfjs",
    "runtime",
    "pdfjs-dist",
    p.pdfjsDist ? "ok" : "missing",
    p.pdfjsDist
      ? "Installed; used by DrawingPdfViewer / PlanTakeoffWorkbench."
      : "Missing — required for PDF render.",
    p.pdfjsDist ? undefined : "npm i pdfjs-dist"
  );
  push(
    "pkg.sharp",
    "runtime",
    "sharp",
    !p.sharp ? "missing" : p.sharpImportWorks === false ? "failed" : "ok",
    !p.sharp
      ? "Missing."
      : p.sharpImportWorks === false
        ? "Declared but import failed."
        : "Installed; rasterDecode.ts uses it server-side.",
    !p.sharp ? "npm i sharp" : undefined
  );
  push(
    "pkg.firebase",
    "runtime",
    "firebase (client)",
    p.firebase ? "ok" : "missing",
    p.firebase ? "Installed." : "Missing."
  );
  push(
    "pkg.firebaseAdmin",
    "runtime",
    "firebase-admin",
    p.firebaseAdmin ? "ok" : "missing",
    p.firebaseAdmin ? "Installed." : "Missing."
  );
  push(
    "pkg.tesseract",
    "runtime",
    "tesseract.js",
    p.tesseractJs ? "ok" : "missing",
    p.tesseractJs
      ? "Installed; OCR nearbyText context-only."
      : "Missing."
  );
  push(
    "pkg.opencvJs",
    "runtime",
    "OpenCV (JS)",
    "missing",
    "Not installed (expected). Custom color-mask detector is used."
  );
  push(
    "pkg.pgvector",
    "runtime",
    "pg / pgvector (npm)",
    p.pgvectorClient || p.pgClient ? "warning" : "missing",
    p.pgvectorClient || p.pgClient
      ? "Present in package.json but unused by takeoff — do not wire yet."
      : "Not installed."
  );
  push(
    "pkg.azureDi",
    "runtime",
    "Azure Document Intelligence (npm)",
    p.azureDocumentIntelligence ? "warning" : "missing",
    p.azureDocumentIntelligence
      ? "SDK installed but not wired into analyze-region."
      : "Not installed."
  );

  push(
    "feat.raster",
    "feature",
    "Raster / color-mask pipeline",
    f.rasterPipeline ? "ok" : "missing",
    "visualSymbolCounter + regionAnalyzer + analyzeRegionService."
  );
  push(
    "feat.pdfjsViewer",
    "feature",
    "PDF.js in DrawingPdfViewer",
    f.drawingPdfViewerUsesPdfJs ? "ok" : "missing",
    "Page render + overlays."
  );
  push(
    "feat.ocr",
    "feature",
    "OCR nearby text",
    f.ocrNearbyText && f.ocrIsContextOnly ? "ok" : "missing",
    "Context-only — never updates quantities."
  );
  push(
    "feat.findSimilar",
    "feature",
    "Find similar / template match",
    f.findSimilar && f.findSimilarCreatesOnlyProbableCandidates ? "ok" : "missing",
    "Probable template_match candidates only."
  );
  push(
    "feat.vector",
    "feature",
    "Vector PDF extraction",
    f.vectorExtraction ? "ok" : "missing",
    "Missing — no operator-list extractor; worker not wired."
  );
  push(
    "feat.pythonWorker",
    "feature",
    "Python takeoff worker",
    f.pythonWorkerWired ? "ok" : f.pythonWorkerScaffold ? "warning" : "missing",
    f.pythonWorkerWired
      ? "Wired to production."
      : f.pythonWorkerScaffold
        ? "Scaffold at services/takeoff-analyzer-worker/ — NOT wired."
        : "No scaffold."
  );
  push(
    "feat.geminiFallback",
    "feature",
    "Gemini takeoff fallback",
    f.geminiTakeoffFallback ? "warning" : "ok",
    f.geminiTakeoffFallback ? "Enabled." : "Disabled for takeoff pipeline."
  );
  push(
    "feat.opencvReal",
    "feature",
    "Real OpenCV library",
    "missing",
    "Missing (expected). source=opencv means custom CC, not OpenCV."
  );

  const summary = { ok: 0, warning: 0, missing: 0, failed: 0 };
  for (const c of checks) summary[c.status]++;

  const canSupportSymbolMarking =
    p.pdfjsDist &&
    p.sharp &&
    p.firebase &&
    f.rasterPipeline &&
    f.customColorMaskDetector &&
    f.drawingPdfViewerUsesPdfJs &&
    f.findSimilar &&
    f.findSimilarCreatesOnlyProbableCandidates &&
    (!f.ocrNearbyText || f.ocrIsContextOnly) &&
    !f.geminiTakeoffFallback;

  return {
    generatedAt: new Date().toISOString(),
    checks,
    summary,
    canSupportSymbolMarking,
  };
}

async function main() {
  const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
  const deps = { ...pkg.dependencies, ...pkg.devDependencies };
  const packages = inventoryFromPackageJson(deps);
  packages.sharpImportWorks = await probeSharp();

  const pythonWorkerScaffold = existsSync(
    join(root, "services/takeoff-analyzer-worker/main.py")
  );

  const report = buildReport({
    packages,
    features: {
      rasterPipeline: true,
      ocrNearbyText: true,
      ocrIsContextOnly: true,
      findSimilar: true,
      findSimilarCreatesOnlyProbableCandidates: true,
      vectorExtraction: false,
      pythonWorkerScaffold,
      pythonWorkerWired: false,
      geminiTakeoffFallback: false,
      realOpenCvLibrary: false,
      customColorMaskDetector: true,
      drawingPdfViewerUsesPdfJs: true,
    },
  });

  console.log("\n=== Staveto Takeoff Dependency Doctor ===\n");
  console.log(`Generated: ${report.generatedAt}`);
  console.log(
    `Symbol marking support: ${report.canSupportSymbolMarking ? "YES" : "NO"}\n`
  );
  console.log(
    `Summary: ok=${report.summary.ok} warning=${report.summary.warning} missing=${report.summary.missing} failed=${report.summary.failed}\n`
  );
  for (const c of report.checks) {
    const tag = c.status.toUpperCase().padEnd(7);
    console.log(`[${tag}] (${c.category}) ${c.label}`);
    console.log(`         ${c.detail}`);
    if (c.fixHint) console.log(`         Fix: ${c.fixHint}`);
  }
  console.log("\nUI: /app/dev/takeoff-doctor");
  console.log("Docs: docs/takeoff-dependencies.md\n");

  process.exit(report.summary.failed > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
