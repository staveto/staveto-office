/**
 * Takeoff Dependency Doctor — pure inventory + status report.
 *
 * Does not call Firestore/Storage, does not change quantities, and does not
 * import heavy ML stacks. Used by:
 * - npm run takeoff:doctor (Node script)
 * - /app/dev/takeoff-doctor (dev-only UI)
 * - unit tests with mocked inventory
 */

export type DoctorStatus = "ok" | "warning" | "missing" | "failed";

export type DoctorCheck = {
  id: string;
  category: "runtime" | "feature" | "firebase" | "external";
  label: string;
  status: DoctorStatus;
  detail: string;
  fixHint?: string;
};

export type DoctorReport = {
  generatedAt: string;
  checks: DoctorCheck[];
  summary: Record<DoctorStatus, number>;
  /** True when raster + review pipeline can support symbol marking. */
  canSupportSymbolMarking: boolean;
};

/** Declared npm dependencies relevant to takeoff (presence only). */
export type TakeoffPackageInventory = {
  pdfjsDist: boolean;
  sharp: boolean;
  firebase: boolean;
  firebaseAdmin: boolean;
  tesseractJs: boolean;
  /** Any opencv.js / @techstark/opencv-js style package. */
  opencvJs: boolean;
  pgClient: boolean;
  pgvectorClient: boolean;
  azureDocumentIntelligence: boolean;
  /** True when `import("sharp")` succeeded in Node (optional runtime probe). */
  sharpImportWorks?: boolean | null;
};

/** Feature / architecture facts (implementation, not just packages). */
export type TakeoffFeatureInventory = {
  rasterPipeline: boolean;
  ocrNearbyText: boolean;
  /** OCR never writes quantities — always true when ocrNearbyText is context-only. */
  ocrIsContextOnly: boolean;
  findSimilar: boolean;
  findSimilarCreatesOnlyProbableCandidates: boolean;
  /** True PDF vector path/curve/line extraction (operator list or worker). */
  vectorExtraction: boolean;
  /** Scaffold folder exists; not wired to production. */
  pythonWorkerScaffold: boolean;
  /** Production code calls the Python worker. */
  pythonWorkerWired: boolean;
  /** Gemini used as takeoff symbol fallback. */
  geminiTakeoffFallback: boolean;
  /** Real OpenCV library (not custom connected-components labeled "opencv"). */
  realOpenCvLibrary: boolean;
  customColorMaskDetector: boolean;
  drawingPdfViewerUsesPdfJs: boolean;
};

export type TakeoffFirebaseInventory = {
  authenticatedUser: boolean | null;
  projectAccessOk: boolean | null;
  firestoreProjectReadable: boolean | null;
  storageBucketConfigured: boolean | null;
  takeoffStoragePathOk: boolean | null;
  confirmedSymbolsIndexOk: boolean | null;
  detail?: string;
};

export type TakeoffDoctorInput = {
  packages: TakeoffPackageInventory;
  features: TakeoffFeatureInventory;
  firebase?: TakeoffFirebaseInventory;
  now?: Date;
};

function summarize(checks: DoctorCheck[]): Record<DoctorStatus, number> {
  const summary: Record<DoctorStatus, number> = {
    ok: 0,
    warning: 0,
    missing: 0,
    failed: 0,
  };
  for (const c of checks) summary[c.status]++;
  return summary;
}

function check(
  id: string,
  category: DoctorCheck["category"],
  label: string,
  status: DoctorStatus,
  detail: string,
  fixHint?: string
): DoctorCheck {
  return { id, category, label, status, detail, fixHint };
}

/**
 * Build a dependency / capability report from an inventory snapshot.
 * Pure — safe for unit tests with mocked facts.
 */
export function buildTakeoffDoctorReport(input: TakeoffDoctorInput): DoctorReport {
  const { packages: p, features: f } = input;
  const checks: DoctorCheck[] = [];

  // ---- Runtime / packages ----
  checks.push(
    check(
      "pkg.pdfjs",
      "runtime",
      "pdfjs-dist",
      p.pdfjsDist ? "ok" : "missing",
      p.pdfjsDist
        ? "Installed; used by DrawingPdfViewer / PlanTakeoffWorkbench rendering."
        : "Missing — required for PDF page render and overlays.",
      p.pdfjsDist ? undefined : "npm i pdfjs-dist"
    )
  );
  checks.push(
    check(
      "pkg.sharp",
      "runtime",
      "sharp",
      !p.sharp
        ? "missing"
        : p.sharpImportWorks === false
          ? "failed"
          : p.sharpImportWorks === true
            ? "ok"
            : "ok",
      !p.sharp
        ? "Missing — needed for server-side PNG/JPEG → RGBA decode."
        : p.sharpImportWorks === false
          ? "Declared but import('sharp') failed in this runtime."
          : "Installed; used by src/lib/server/rasterDecode.ts (analyze-region / find-similar API).",
      !p.sharp ? "npm i sharp" : undefined
    )
  );
  checks.push(
    check(
      "pkg.firebase",
      "runtime",
      "firebase (client)",
      p.firebase ? "ok" : "missing",
      p.firebase ? "Installed." : "Missing client SDK.",
      p.firebase ? undefined : "npm i firebase"
    )
  );
  checks.push(
    check(
      "pkg.firebaseAdmin",
      "runtime",
      "firebase-admin",
      p.firebaseAdmin ? "ok" : "missing",
      p.firebaseAdmin ? "Installed (API routes / admin)." : "Missing admin SDK.",
      p.firebaseAdmin ? undefined : "npm i firebase-admin"
    )
  );
  checks.push(
    check(
      "pkg.tesseract",
      "runtime",
      "tesseract.js",
      p.tesseractJs ? "ok" : "missing",
      p.tesseractJs
        ? "Installed; OCR adapter uses createWorker for nearbyText (context-only)."
        : "Missing — OCR nearby text adapter expects tesseract.js.",
      p.tesseractJs ? undefined : "npm i tesseract.js"
    )
  );
  checks.push(
    check(
      "pkg.opencvJs",
      "runtime",
      "OpenCV (JS)",
      p.opencvJs ? "warning" : "missing",
      p.opencvJs
        ? "OpenCV JS package present — prefer not to rely on it in the main app."
        : "Not installed. Detection uses custom color-mask / connected components (not OpenCV).",
      "Do not install opencv.js into Next.js for this phase."
    )
  );
  checks.push(
    check(
      "pkg.pgvector",
      "runtime",
      "pg / pgvector (npm)",
      p.pgvectorClient || p.pgClient ? "warning" : "missing",
      p.pgvectorClient || p.pgClient
        ? "Client packages are in package.json but not used by takeoff code. Do not wire yet."
        : "Not installed (intentional for this phase).",
      "Keep vector store out of the main Next.js app until a dedicated worker/service exists."
    )
  );
  checks.push(
    check(
      "pkg.azureDi",
      "runtime",
      "Azure Document Intelligence (npm)",
      p.azureDocumentIntelligence ? "warning" : "missing",
      p.azureDocumentIntelligence
        ? "SDK installed but not wired into analyze-region / OCR. Unused."
        : "Not installed.",
      "Do not enable Azure DI in this phase without an explicit product decision."
    )
  );

  // ---- Features ----
  checks.push(
    check(
      "feat.raster",
      "feature",
      "Raster / color-mask pipeline",
      f.rasterPipeline && f.customColorMaskDetector ? "ok" : "missing",
      f.rasterPipeline
        ? "visualSymbolCounter + regionAnalyzer + analyzeRegionService available."
        : "Raster analyze pipeline missing.",
      undefined
    )
  );
  checks.push(
    check(
      "feat.pdfjsViewer",
      "feature",
      "PDF.js in DrawingPdfViewer",
      f.drawingPdfViewerUsesPdfJs ? "ok" : "missing",
      f.drawingPdfViewerUsesPdfJs
        ? "DrawingPdfViewer loads pdfjs-dist for page render + overlays."
        : "Viewer does not use pdfjs-dist.",
      undefined
    )
  );
  checks.push(
    check(
      "feat.ocr",
      "feature",
      "OCR nearby text",
      !f.ocrNearbyText
        ? "missing"
        : f.ocrIsContextOnly
          ? "ok"
          : "failed",
      !f.ocrNearbyText
        ? "OCR nearby text not implemented."
        : f.ocrIsContextOnly
          ? "Implemented (tesseract.js). Context-only — does not update quantities."
          : "OCR appears to affect quantities — unsafe.",
      undefined
    )
  );
  checks.push(
    check(
      "feat.findSimilar",
      "feature",
      "Find similar / template match",
      !f.findSimilar
        ? "missing"
        : f.findSimilarCreatesOnlyProbableCandidates
          ? "ok"
          : "failed",
      !f.findSimilar
        ? "Find similar not implemented."
        : f.findSimilarCreatesOnlyProbableCandidates
          ? "confirmedSymbolSimilarService returns probable template_match candidates only."
          : "Find similar must not create confirmedSymbols / takeoffItems / evidence.",
      undefined
    )
  );
  checks.push(
    check(
      "feat.vector",
      "feature",
      "Vector PDF extraction",
      f.vectorExtraction ? "ok" : "missing",
      f.vectorExtraction
        ? "Vector path/line/rect extraction is available."
        : "Missing — no PDF operator-list extractor and worker not wired. Raster-only today.",
      "Next: plan-type detector via PDF.js; later optional Python worker (pypdfium2 + pdfplumber)."
    )
  );
  checks.push(
    check(
      "feat.pythonWorker",
      "feature",
      "Python takeoff worker",
      f.pythonWorkerWired
        ? "ok"
        : f.pythonWorkerScaffold
          ? "warning"
          : "missing",
      f.pythonWorkerWired
        ? "Worker is called from production — verify auth."
        : f.pythonWorkerScaffold
          ? "Scaffold present under services/takeoff-analyzer-worker/ — NOT wired to production."
          : "No Python worker scaffold.",
      "Do not call the worker from PlanTakeoffWorkbench until auth + Cloud Run TODOs are done."
    )
  );
  checks.push(
    check(
      "feat.geminiFallback",
      "feature",
      "Gemini takeoff fallback",
      f.geminiTakeoffFallback ? "warning" : "ok",
      f.geminiTakeoffFallback
        ? "Gemini takeoff fallback appears enabled — keep disabled for symbol marking phase."
        : "Disabled for takeoff region analyzer (no Gemini symbol fallback in pipeline).",
      undefined
    )
  );
  checks.push(
    check(
      "feat.opencvReal",
      "feature",
      "Real OpenCV library",
      f.realOpenCvLibrary ? "warning" : "missing",
      f.realOpenCvLibrary
        ? "Real OpenCV is present — unexpected in main app."
        : "Missing (expected). Candidate source field may say \"opencv\" but logic is custom raster CC.",
      "Keep custom detector; use opencv-python-headless only inside the optional Python worker."
    )
  );

  // ---- Firebase (optional probes) ----
  const fb = input.firebase;
  if (fb) {
    const map = (
      id: string,
      label: string,
      value: boolean | null,
      okDetail: string,
      failDetail: string
    ) => {
      if (value === null) {
        checks.push(
          check(id, "firebase", label, "warning", "Not probed in this run.", undefined)
        );
      } else if (value) {
        checks.push(check(id, "firebase", label, "ok", okDetail));
      } else {
        checks.push(check(id, "firebase", label, "failed", failDetail));
      }
    };
    map(
      "fb.auth",
      "Authenticated user",
      fb.authenticatedUser,
      "Signed-in user present.",
      "No authenticated user."
    );
    map(
      "fb.access",
      "Project access",
      fb.projectAccessOk,
      "Project access check passed.",
      "Project access check failed."
    );
    map(
      "fb.firestore",
      "Firestore project read",
      fb.firestoreProjectReadable,
      "Can read project document.",
      "Cannot read project document."
    );
    map(
      "fb.storage",
      "Storage bucket configured",
      fb.storageBucketConfigured,
      "Storage bucket config present.",
      "Storage bucket missing in Firebase config."
    );
    map(
      "fb.takeoffPath",
      "Takeoff image Storage path",
      fb.takeoffStoragePathOk,
      "Takeoff image path builder / access OK.",
      "Takeoff Storage path check failed."
    );
    map(
      "fb.index",
      "confirmedSymbols index query",
      fb.confirmedSymbolsIndexOk,
      "confirmedSymbols query OK (or empty result).",
      "confirmedSymbols query failed — check firestore.indexes.json composite index."
    );
    if (fb.detail) {
      checks.push(
        check("fb.detail", "firebase", "Firebase probe notes", "warning", fb.detail)
      );
    }
  }

  // ---- External tools (never installed into Next.js) ----
  checks.push(
    check(
      "ext.cvat",
      "external",
      "CVAT",
      "missing",
      "Not part of the app. Use only for offline labeling later.",
      "Do not install into Next.js."
    )
  );
  checks.push(
    check(
      "ext.labelStudio",
      "external",
      "Label Studio",
      "missing",
      "Not part of the app.",
      "Do not install into Next.js."
    )
  );
  checks.push(
    check(
      "ext.qdrant",
      "external",
      "Qdrant",
      "missing",
      "Not deployed. Optional later for template embeddings.",
      "Do not install into Next.js."
    )
  );

  const summary = summarize(checks);
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
    generatedAt: (input.now ?? new Date()).toISOString(),
    checks,
    summary,
    canSupportSymbolMarking,
  };
}

/**
 * Default feature inventory for the current Staveto takeoff codebase.
 * Update this when wiring vector extraction or the Python worker.
 */
export function defaultTakeoffFeatureInventory(opts?: {
  pythonWorkerScaffold?: boolean;
}): TakeoffFeatureInventory {
  return {
    rasterPipeline: true,
    ocrNearbyText: true,
    ocrIsContextOnly: true,
    findSimilar: true,
    findSimilarCreatesOnlyProbableCandidates: true,
    vectorExtraction: false,
    pythonWorkerScaffold: opts?.pythonWorkerScaffold ?? false,
    pythonWorkerWired: false,
    geminiTakeoffFallback: false,
    realOpenCvLibrary: false,
    customColorMaskDetector: true,
    drawingPdfViewerUsesPdfJs: true,
  };
}

/** Map package.json dependency names → inventory flags. */
export function inventoryFromPackageJson(deps: Record<string, string | undefined>): TakeoffPackageInventory {
  const has = (name: string) => Boolean(deps[name]);
  return {
    pdfjsDist: has("pdfjs-dist"),
    sharp: has("sharp"),
    firebase: has("firebase"),
    firebaseAdmin: has("firebase-admin"),
    tesseractJs: has("tesseract.js"),
    opencvJs:
      has("opencv.js") ||
      has("@techstark/opencv-js") ||
      has("opencv4nodejs"),
    pgClient: has("pg"),
    pgvectorClient: has("pgvector"),
    azureDocumentIntelligence:
      has("@azure-rest/ai-document-intelligence") ||
      has("@azure/ai-form-recognizer"),
  };
}

/** Format a compact CLI/table-friendly line. */
export function formatDoctorCheckLine(c: DoctorCheck): string {
  const tag = c.status.toUpperCase().padEnd(7);
  return `[${tag}] ${c.label}: ${c.detail}`;
}
