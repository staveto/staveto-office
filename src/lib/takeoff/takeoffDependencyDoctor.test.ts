import { describe, expect, it } from "vitest";
import {
  buildTakeoffDoctorReport,
  defaultTakeoffFeatureInventory,
  inventoryFromPackageJson,
  type TakeoffPackageInventory,
} from "./takeoffDependencyDoctor";

const fullPackages: TakeoffPackageInventory = {
  pdfjsDist: true,
  sharp: true,
  sharpImportWorks: true,
  firebase: true,
  firebaseAdmin: true,
  tesseractJs: true,
  opencvJs: false,
  pgClient: false,
  pgvectorClient: false,
  azureDocumentIntelligence: false,
};

describe("inventoryFromPackageJson", () => {
  it("reports installed packages from dependency map", () => {
    const inv = inventoryFromPackageJson({
      "pdfjs-dist": "^5",
      sharp: "^0.35",
      firebase: "^12",
      "firebase-admin": "^13",
      "tesseract.js": "^7",
      pgvector: "^0.2",
      "@azure-rest/ai-document-intelligence": "^1",
    });
    expect(inv.pdfjsDist).toBe(true);
    expect(inv.sharp).toBe(true);
    expect(inv.tesseractJs).toBe(true);
    expect(inv.pgvectorClient).toBe(true);
    expect(inv.azureDocumentIntelligence).toBe(true);
    expect(inv.opencvJs).toBe(false);
  });
});

describe("buildTakeoffDoctorReport", () => {
  it("marks vector extraction missing when no worker/operator-list extractor exists", () => {
    const report = buildTakeoffDoctorReport({
      packages: fullPackages,
      features: defaultTakeoffFeatureInventory({ pythonWorkerScaffold: false }),
      now: new Date("2026-07-17T12:00:00.000Z"),
    });
    const vector = report.checks.find((c) => c.id === "feat.vector");
    expect(vector?.status).toBe("missing");
    expect(vector?.detail.toLowerCase()).toContain("missing");
  });

  it("marks python worker as warning when scaffold exists but not wired", () => {
    const report = buildTakeoffDoctorReport({
      packages: fullPackages,
      features: defaultTakeoffFeatureInventory({ pythonWorkerScaffold: true }),
    });
    const worker = report.checks.find((c) => c.id === "feat.pythonWorker");
    expect(worker?.status).toBe("warning");
    expect(worker?.detail).toMatch(/NOT wired/i);
  });

  it("reports installed runtime packages as OK", () => {
    const report = buildTakeoffDoctorReport({
      packages: fullPackages,
      features: defaultTakeoffFeatureInventory(),
    });
    for (const id of [
      "pkg.pdfjs",
      "pkg.sharp",
      "pkg.firebase",
      "pkg.firebaseAdmin",
      "pkg.tesseract",
      "feat.raster",
      "feat.ocr",
      "feat.findSimilar",
    ]) {
      expect(report.checks.find((c) => c.id === id)?.status).toBe("ok");
    }
  });

  it("warns when unused pgvector / Azure SDKs are present", () => {
    const report = buildTakeoffDoctorReport({
      packages: {
        ...fullPackages,
        pgClient: true,
        pgvectorClient: true,
        azureDocumentIntelligence: true,
      },
      features: defaultTakeoffFeatureInventory(),
    });
    expect(report.checks.find((c) => c.id === "pkg.pgvector")?.status).toBe("warning");
    expect(report.checks.find((c) => c.id === "pkg.azureDi")?.status).toBe("warning");
  });

  it("canSupportSymbolMarking is true for current default inventory", () => {
    const report = buildTakeoffDoctorReport({
      packages: fullPackages,
      features: defaultTakeoffFeatureInventory({ pythonWorkerScaffold: true }),
    });
    expect(report.canSupportSymbolMarking).toBe(true);
  });

  it("fails OCR check if OCR is not context-only", () => {
    const features = defaultTakeoffFeatureInventory();
    features.ocrIsContextOnly = false;
    const report = buildTakeoffDoctorReport({
      packages: fullPackages,
      features,
    });
    expect(report.checks.find((c) => c.id === "feat.ocr")?.status).toBe("failed");
    expect(report.canSupportSymbolMarking).toBe(false);
  });

  it("does not invent quantity-related failures when packages are healthy", () => {
    // Doctor never touches takeoff quantities — report is inventory-only.
    const report = buildTakeoffDoctorReport({
      packages: fullPackages,
      features: defaultTakeoffFeatureInventory(),
    });
    expect(report.checks.every((c) => !/quantity updated/i.test(c.detail))).toBe(true);
  });
});
