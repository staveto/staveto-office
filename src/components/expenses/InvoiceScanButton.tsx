"use client";

import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { useI18n } from "@/i18n/I18nContext";
import { ScanLine, Loader2 } from "lucide-react";
import { uploadInvoiceForOcr, ACCEPTED_INVOICE_MIME } from "@/services/expenseAttachments";
import { extractInvoiceFields } from "@/services/invoiceOcr";
import type { ParsedInvoiceFields } from "@/lib/invoiceTextParser";

export type InvoiceScanMeta = {
  filePath: string;
  mimeType: string;
  confidence: number;
};

export type InvoiceScanResult = {
  fields: ParsedInvoiceFields;
  meta: InvoiceScanMeta;
};

type InvoiceScanButtonProps = {
  projectId: string;
  disabled?: boolean;
  onParsed: (result: InvoiceScanResult) => void;
};

export function InvoiceScanButton({ projectId, disabled, onParsed }: InvoiceScanButtonProps) {
  const { t } = useI18n();
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const mapError = (err: unknown): string => {
    const code = err instanceof Error ? err.message : "";
    switch (code) {
      case "FILE_TOO_LARGE":
        return t("expenses.ocr.errorTooLarge");
      case "UNSUPPORTED_TYPE":
        return t("expenses.ocr.errorType");
      case "OCR_UNAVAILABLE":
        return t("expenses.ocr.errorUnavailable");
      case "OCR_NO_TEXT":
        return t("expenses.ocr.errorNoText");
      default:
        return t("expenses.ocr.errorFailed");
    }
  };

  const handleFile = async (file: File | undefined) => {
    if (!file || !projectId) return;
    setBusy(true);
    setError(null);
    try {
      const uploaded = await uploadInvoiceForOcr(projectId, file);
      const result = await extractInvoiceFields({
        projectId,
        storagePath: uploaded.storagePath,
        mimeType: uploaded.mimeType,
      });
      onParsed({
        fields: result.fields,
        meta: {
          filePath: uploaded.storagePath,
          mimeType: uploaded.mimeType,
          confidence: result.confidence,
        },
      });
    } catch (err) {
      setError(mapError(err));
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  return (
    <div className="rounded-lg border border-dashed border-border bg-muted/30 p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="space-y-0.5">
          <p className="text-sm font-medium">{t("expenses.ocr.title")}</p>
          <p className="text-xs text-muted-foreground">{t("expenses.ocr.helper")}</p>
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={disabled || busy || !projectId}
          onClick={() => inputRef.current?.click()}
        >
          {busy ? (
            <>
              <Loader2 className="size-4 animate-spin" />
              {t("expenses.ocr.scanning")}
            </>
          ) : (
            <>
              <ScanLine className="size-4" />
              {t("expenses.ocr.scan")}
            </>
          )}
        </Button>
      </div>
      {error && <p className="mt-2 text-xs text-destructive">{error}</p>}
      <input
        ref={inputRef}
        type="file"
        accept={ACCEPTED_INVOICE_MIME.join(",")}
        className="hidden"
        onChange={(e) => void handleFile(e.target.files?.[0])}
      />
    </div>
  );
}
