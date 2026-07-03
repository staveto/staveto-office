import type { AttachmentSummary } from "./attachmentSummarySchema";

export function buildAttachmentVisionPrompt(language: string, fileName: string): string {
  return `You are analyzing construction project documents for Staveto.
Extract only information visible or clearly stated in the uploaded files.
Do not invent facts.
If the file contains a floor plan, extract room names, room areas, visible dimensions and relevant construction hints.
If materials are not explicitly listed, provide possible material categories as low-confidence suggestions and ask missing questions.
Return valid JSON only.

Inspect carefully:
- all visible text
- floor plans
- room tables
- dimensions
- area schedules
- material notes
- construction scope
- symbols/labels
- page titles
- technical notes

Rules:
- Do not invent exact quantities if not visible in the document.
- If material is only inferred, mark confidence "low" and explain in sourceNote.
- Distinguish direct evidence from assumptions in sourceNote fields.
- If no material list exists in the PDF, say so in extractedTextSummary and missingQuestions.
- Human-readable strings language: ${language}
- File name: ${fileName}

Return JSON matching this schema:
{
  "fileName": string,
  "documentType": "floor_plan"|"technical_specification"|"quote"|"invoice"|"photo"|"unknown",
  "extractedTextSummary": string,
  "roomsAndAreas": [{ "roomName": string, "areaM2"?: number, "floor"?: string, "sourceNote": string }],
  "dimensions": [{ "label": string, "value": string, "sourceNote": string }],
  "detectedScopeOfWork": string[],
  "detectedMaterials": [{ "name": string, "category"?: string, "quantity"?: number, "unit"?: string, "confidence": "low"|"medium"|"high", "sourceNote": string }],
  "timeOrDurationHints": [{ "description": string, "value"?: string, "sourceNote": string }],
  "risksOrConstraints": string[],
  "missingQuestions": string[],
  "confidence": "low"|"medium"|"high"
}`;
}

export function formatAttachmentFindingsForPrompt(summaries: AttachmentSummary[]): string {
  if (summaries.length === 0) {
    return "None — no attachment summaries available.";
  }

  return summaries
    .map((s, index) => {
      const rooms =
        s.roomsAndAreas.length > 0
          ? s.roomsAndAreas
              .map(
                (r) =>
                  `  - ${r.roomName}${r.areaM2 != null ? ` (${r.areaM2} m²)` : ""}${r.floor ? ` [${r.floor}]` : ""} — ${r.sourceNote}`
              )
              .join("\n")
          : "  - none extracted";

      const dimensions =
        s.dimensions.length > 0
          ? s.dimensions.map((d) => `  - ${d.label}: ${d.value} — ${d.sourceNote}`).join("\n")
          : "  - none extracted";

      const materials =
        s.detectedMaterials.length > 0
          ? s.detectedMaterials
              .map(
                (m) =>
                  `  - ${m.name}${m.category ? ` [${m.category}]` : ""}${m.quantity != null ? ` qty ${m.quantity}${m.unit ? ` ${m.unit}` : ""}` : ""} (${m.confidence}) — ${m.sourceNote}`
              )
              .join("\n")
          : "  - none explicitly listed";

      const scope =
        s.detectedScopeOfWork.length > 0
          ? s.detectedScopeOfWork.map((x) => `  - ${x}`).join("\n")
          : "  - none extracted";

      const timeHints =
        s.timeOrDurationHints.length > 0
          ? s.timeOrDurationHints
              .map((t) => `  - ${t.description}${t.value ? `: ${t.value}` : ""} — ${t.sourceNote}`)
              .join("\n")
          : "  - none extracted";

      const questions =
        s.missingQuestions.length > 0
          ? s.missingQuestions.map((q) => `  - ${q}`).join("\n")
          : "  - none";

      return `Document ${index + 1}: ${s.fileName}
Document type: ${s.documentType}
Overall confidence: ${s.confidence}
Summary: ${s.extractedTextSummary}
Rooms and areas:
${rooms}
Dimensions:
${dimensions}
Detected scope of work:
${scope}
Detected materials:
${materials}
Time/duration hints:
${timeHints}
Missing questions:
${questions}
Risks/constraints: ${s.risksOrConstraints.length ? s.risksOrConstraints.join("; ") : "none"}`;
    })
    .join("\n\n");
}

export function mergeAttachmentMissingQuestions(summaries: AttachmentSummary[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const s of summaries) {
    for (const q of s.missingQuestions) {
      const trimmed = q.trim();
      if (!trimmed) continue;
      const key = trimmed.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(trimmed);
    }
  }
  return out;
}
