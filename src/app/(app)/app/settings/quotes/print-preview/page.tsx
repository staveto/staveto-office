"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Info, Loader2, Printer } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { QuoteTemplatePreview } from "@/components/documents/QuoteTemplatePreview";
import { useAuth } from "@/context/AuthContext";
import { useWorkspace } from "@/context/WorkspaceContext";
import { useI18n } from "@/i18n/I18nContext";
import { isCompanyWorkspaceType } from "@/types/workspace";
import { DEFAULT_QUOTE_TEMPLATE } from "@/lib/documents/quoteTemplateContract";
import { loadOrganizationQuoteDocumentContext } from "@/lib/documents/quoteDocumentContext";
import { readQuoteSettingsTestPrintTemplate } from "@/lib/documents/quoteSettingsEditorStorage";
import printStyles from "./print-preview.module.css";

/**
 * Test PDF print — sample quote/customer data only.
 * Template from sessionStorage (current editor state). No Firestore writes.
 */
export default function QuoteSettingsPrintPreviewPage() {
  const { t } = useI18n();
  const { user } = useAuth();
  const { activeWorkspace } = useWorkspace();
  const autoPrinted = useRef(false);

  const orgId =
    activeWorkspace && isCompanyWorkspaceType(activeWorkspace.type)
      ? (activeWorkspace.orgId ?? activeWorkspace.id)
      : null;

  const [template, setTemplate] = useState(DEFAULT_QUOTE_TEMPLATE);
  const [orgContext, setOrgContext] = useState<Awaited<
    ReturnType<typeof loadOrganizationQuoteDocumentContext>
  > | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setTemplate(readQuoteSettingsTestPrintTemplate(typeof sessionStorage !== "undefined" ? sessionStorage : null));
  }, []);

  useEffect(() => {
    if (!user?.id || !orgId) {
      setLoading(false);
      return;
    }
    loadOrganizationQuoteDocumentContext(orgId)
      .then(setOrgContext)
      .finally(() => setLoading(false));
  }, [orgId, user?.id]);

  const previewTemplate = useMemo(() => template, [template]);

  useEffect(() => {
    if (loading || autoPrinted.current) return;
    autoPrinted.current = true;
    const timer = window.setTimeout(() => window.print(), 400);
    return () => window.clearTimeout(timer);
  }, [loading]);

  if (!orgId) {
    return (
      <div className={printStyles.printRoot}>
        <div className="screen-only no-print max-w-lg mx-auto text-center py-24 px-4">
          <p className="text-muted-foreground mb-4">{t("settings.quoteTemplate.companyOnly")}</p>
          <Link href="/app/settings/quotes" className={buttonVariants()}>
            {t("settings.quoteTemplate.printPreviewBack")}
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className={printStyles.printRoot}>
      <div className={`screen-only no-print ${printStyles.instructionBanner}`} role="note">
        <div className={printStyles.instructionBannerInner}>
          <Info className={printStyles.instructionBannerIcon} size={20} aria-hidden />
          <p className="m-0">{t("settings.quoteTemplate.printPreviewBanner")}</p>
        </div>
      </div>

      <div className={`screen-only no-print ${printStyles.toolbar}`}>
        <Link
          href="/app/settings/quotes"
          className={buttonVariants({ variant: "ghost", size: "sm" })}
        >
          <ArrowLeft className="size-4 mr-1" />
          {t("settings.quoteTemplate.printPreviewBack")}
        </Link>
        <Button
          type="button"
          size="sm"
          className="bg-[#e06737] hover:bg-[#c95a30] text-white"
          onClick={() => window.print()}
        >
          <Printer className="size-4 mr-1" />
          {t("settings.quoteTemplate.printPreviewPrint")}
        </Button>
        <p className={printStyles.hint}>{t("settings.quoteTemplate.printPreviewHint")}</p>
      </div>

      {loading ? (
        <div className={`screen-only no-print ${printStyles.loadingWrap}`}>
          <Loader2 className="size-8 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <div className={printStyles.documentWrap}>
          <QuoteTemplatePreview template={previewTemplate} organizationContext={orgContext} />
        </div>
      )}
    </div>
  );
}
