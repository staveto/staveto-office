/**
 * Invoice OCR for the web app.
 *
 * Calls the shared `extractInvoiceDataFromStorage` callable Cloud Function
 * (region europe-west1, also used by the mobile app). The function downloads
 * the file from Storage and runs PDF text extraction / Google Vision OCR,
 * returning the raw extracted text. Structured parsing happens client-side in
 * `@/lib/invoiceTextParser`.
 */
import { getAiCallable } from "@/lib/firebase";
import { parseInvoiceText, type ParsedInvoiceFields } from "@/lib/invoiceTextParser";

type ExtractStoragePayload = {
  projectId: string;
  attachmentId: string;
  filePath: string;
  mimeType: string;
};

type ExtractStorageResponse = {
  success?: boolean;
  ok?: boolean;
  rawText?: string;
  confidence?: number;
  errorCode?: string;
};

export type InvoiceOcrResult = {
  rawText: string;
  confidence: number;
  fields: ParsedInvoiceFields;
};

/**
 * Run OCR on a previously uploaded invoice and return parsed fields.
 * Throws coded Errors:
 * - `OCR_UNAVAILABLE` — function not deployed / unreachable
 * - `OCR_NO_TEXT` — no usable text extracted
 * - `OCR_FAILED` — other failure
 */
export async function extractInvoiceFields(input: {
  projectId: string;
  storagePath: string;
  mimeType: string;
}): Promise<InvoiceOcrResult> {
  const filePath = input.storagePath?.trim();
  if (!filePath) throw new Error("OCR_FAILED");

  let data: ExtractStorageResponse;
  try {
    const call = getAiCallable<ExtractStoragePayload, ExtractStorageResponse>(
      "extractInvoiceDataFromStorage"
    );
    const result = await call({
      projectId: input.projectId,
      attachmentId: "web-ocr",
      filePath,
      mimeType: input.mimeType || "application/octet-stream",
    });
    data = result.data ?? {};
  } catch (err) {
    const code = String((err as { code?: string })?.code ?? "");
    const message = String((err as { message?: string })?.message ?? "");
    if (code.includes("not-found") || /not[-_]?found/i.test(message) || message.includes("functions/")) {
      throw new Error("OCR_UNAVAILABLE");
    }
    throw new Error("OCR_FAILED");
  }

  const ok = data.success === true || data.ok === true;
  const rawText = typeof data.rawText === "string" ? data.rawText : "";

  if (!ok) {
    throw new Error(data.errorCode ? "OCR_NO_TEXT" : "OCR_FAILED");
  }
  if (!rawText.trim()) {
    throw new Error("OCR_NO_TEXT");
  }

  return {
    rawText,
    confidence: typeof data.confidence === "number" ? data.confidence : 0,
    fields: parseInvoiceText(rawText),
  };
}
