export type AttachmentConfidence = "low" | "medium" | "high";

export type AttachmentDocumentType =
  | "floor_plan"
  | "technical_specification"
  | "quote"
  | "invoice"
  | "photo"
  | "unknown";

export type AttachmentSummary = {
  fileName: string;
  documentType: AttachmentDocumentType;
  extractedTextSummary: string;
  roomsAndAreas: {
    roomName: string;
    areaM2?: number;
    floor?: string;
    sourceNote: string;
  }[];
  dimensions: {
    label: string;
    value: string;
    sourceNote: string;
  }[];
  detectedScopeOfWork: string[];
  detectedMaterials: {
    name: string;
    category?: string;
    quantity?: number;
    unit?: string;
    confidence: AttachmentConfidence;
    sourceNote: string;
  }[];
  timeOrDurationHints: {
    description: string;
    value?: string;
    sourceNote: string;
  }[];
  risksOrConstraints: string[];
  missingQuestions: string[];
  confidence: AttachmentConfidence;
};

export type DraftMaterialSuggestion = {
  name: string;
  category: string;
  quantity?: number;
  unit?: string;
  confidence: AttachmentConfidence;
  source: "attachment" | "user_text" | "inferred";
  sourceNote?: string;
};

export type DraftProjectFacts = {
  buildingType?: string;
  totalKnownAreaM2?: number;
  rooms?: { name: string; areaM2?: number }[];
  dimensions?: { label: string; value: string }[];
};

export type ProcessedFileDiagnostic = {
  name: string;
  mimeType?: string;
  status: "processed" | "skipped" | "failed";
  reason?: string;
  extractedSignals?: {
    hasFloorPlan?: boolean;
    hasRoomSchedule?: boolean;
    hasDimensions?: boolean;
    hasMaterialNotes?: boolean;
    hasWorkScope?: boolean;
  };
};

export type AttachmentProcessing = {
  uploadedFileCount: number;
  processedFileCount: number;
  skippedFileCount: number;
  processedFiles: ProcessedFileDiagnostic[];
  warnings: string[];
};

export type MaterialSourceKind = "attachment" | "inferred" | "needs_confirmation";

export function resolveMaterialSourceKind(m: {
  confidence?: AttachmentConfidence;
  sourceNote?: string;
  source?: DraftMaterialSuggestion["source"];
}): MaterialSourceKind {
  const note = (m.sourceNote ?? "").toLowerCase();
  if (m.source === "attachment" && m.confidence !== "low") return "attachment";
  if (
    note.includes("not found in attachment") ||
    note.includes("needs confirmation") ||
    note.includes("potvrden")
  ) {
    return "needs_confirmation";
  }
  if (m.source === "inferred" || m.confidence === "low") return "inferred";
  if (m.source === "attachment") return "attachment";
  return m.confidence === "high" || m.confidence === "medium" ? "attachment" : "inferred";
}

export function formatAttachmentProcessingSummary(
  processing: AttachmentProcessing | undefined,
  locale: "sk" | "de" | "en"
): { headline: string; found: string } | null {
  if (!processing || processing.processedFileCount === 0) return null;

  const signals = new Set<string>();
  for (const file of processing.processedFiles) {
    const s = file.extractedSignals;
    if (!s) continue;
    if (s.hasFloorPlan) signals.add("floor_plan");
    if (s.hasRoomSchedule) signals.add("rooms");
    if (s.hasDimensions) signals.add("dimensions");
    if (s.hasMaterialNotes) signals.add("materials");
    if (s.hasWorkScope) signals.add("scope");
  }

  const labels: Record<string, Record<"sk" | "de" | "en", string>> = {
    floor_plan: { sk: "pôdorys", de: "Grundriss", en: "floor plan" },
    rooms: { sk: "miestnosti", de: "Räume", en: "rooms" },
    dimensions: { sk: "rozmery", de: "Abmessungen", en: "dimensions" },
    materials: { sk: "materiály", de: "Materialien", en: "materials" },
    scope: { sk: "rozsah prác", de: "Leistungsumfang", en: "scope of work" },
  };

  const foundParts = [...signals]
    .map((key) => labels[key]?.[locale])
    .filter(Boolean);

  const count = processing.processedFileCount;
  const headline =
    locale === "sk"
      ? `AI analyzovala ${count} ${count === 1 ? "dokument" : count < 5 ? "dokumenty" : "dokumentov"}.`
      : locale === "de"
        ? `KI hat ${count} ${count === 1 ? "Dokument" : "Dokumente"} analysiert.`
        : `AI analyzed ${count} ${count === 1 ? "document" : "documents"}.`;

  const found =
    foundParts.length > 0
      ? locale === "sk"
        ? `Nájdené: ${foundParts.join(", ")}.`
        : locale === "de"
          ? `Gefunden: ${foundParts.join(", ")}.`
          : `Found: ${foundParts.join(", ")}.`
      : locale === "sk"
        ? "Nájdené: obmedzené údaje z príloh."
        : locale === "de"
          ? "Gefunden: begrenzte Angaben aus Anhängen."
          : "Found: limited data from attachments.";

  return { headline, found };
}
