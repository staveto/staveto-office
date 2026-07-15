import { describe, expect, it } from "vitest";
import {
  buildEstimatorDocumentsFromAttachments,
  hydrateEstimatorDocuments,
  inferDocumentRole,
} from "./estimatorDocuments";
import type { EstimatorDocument } from "@/types/estimatorPositions";

describe("estimatorDocuments", () => {
  it("infers pricebook role for CSV cennik files", () => {
    expect(
      inferDocumentRole({ fileName: "cennik_2024.csv", mimeType: "text/csv" })
    ).toBe("pricebook");
  });

  it("hydrateEstimatorDocuments keeps stored docs and appends new attachments", () => {
    const stored: EstimatorDocument[] = [
      {
        id: "doc_old",
        fileId: "file-old",
        fileName: "plan.pdf",
        mimeType: "application/pdf",
        role: "drawing",
        trades: ["electrical"],
        documentTypes: ["drawing"],
        status: "processed",
        confidence: "high",
      },
    ];
    const built = buildEstimatorDocumentsFromAttachments(
      [
        {
          id: "file-old",
          fileName: "plan.pdf",
          mimeType: "application/pdf",
          storagePath: "x",
        },
        {
          id: "file-new",
          fileName: "vykaz.pdf",
          mimeType: "application/pdf",
          storagePath: "y",
        },
      ],
      new Map([
        ["file-old", "https://example.com/plan.pdf"],
        ["file-new", "https://example.com/vykaz.pdf"],
      ])
    );

    const hydrated = hydrateEstimatorDocuments(stored, built);
    expect(hydrated).toHaveLength(2);
    expect(hydrated[0]!.id).toBe("doc_old");
    expect(hydrated[0]!.fileUrl).toBe("https://example.com/plan.pdf");
    expect(hydrated[1]!.fileName).toBe("vykaz.pdf");
    expect(hydrated[1]!.fileUrl).toBe("https://example.com/vykaz.pdf");
  });
});
