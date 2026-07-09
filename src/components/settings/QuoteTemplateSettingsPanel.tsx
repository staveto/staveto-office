"use client";



import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import {

  ChevronLeft,

  ChevronRight,

  LayoutTemplate,

  Info,

  Loader2,

  Maximize2,

  Minimize2,

  Printer,

  RotateCcw,

  Save,

} from "lucide-react";

import { Badge } from "@/components/ui/badge";

import { Button } from "@/components/ui/button";

import { useAuth } from "@/context/AuthContext";

import { useWorkspace } from "@/context/WorkspaceContext";

import { useI18n } from "@/i18n/I18nContext";

import { isCompanyWorkspaceType } from "@/types/workspace";

import {

  DEFAULT_QUOTE_TEMPLATE,

  normalizeQuoteTemplate,

  type QuoteDocumentTemplate,

} from "@/lib/documents/quoteTemplateContract";

import {

  resolveQuoteTemplateMessageKey,

  resolveQuoteTemplateMessageKind,

  resolveQuoteTemplateStatusBadge,

  resolveQuoteTemplateStatusBadgeKey,

  type QuoteTemplateLoadState,

} from "@/lib/documents/quoteTemplateLoadState";

import {

  clampEditorPanelWidth,

  DEFAULT_EDITOR_PANEL_WIDTH,

  openQuoteSettingsTestPrint,

  quoteTemplatesEqual,

  readEditorPanelWidth,

  writeEditorPanelWidth,

  type QuotePreviewZoom,

} from "@/lib/documents/quoteSettingsEditorStorage";

import {

  loadQuoteTemplateForSettings,

  resetDefaultQuoteTemplate,

  saveDefaultQuoteTemplate,

} from "@/services/documents/quoteTemplateService";

import { loadOrganizationQuoteDocumentContext } from "@/lib/documents/quoteDocumentContext";

import type { OrganizationQuoteDocumentContext } from "@/lib/documents/quoteDocumentContext";

import { QuoteTemplatePreview } from "@/components/documents/QuoteTemplatePreview";

import { QuoteTemplatePreviewFrame } from "@/components/documents/QuoteTemplatePreviewFrame";

import { DocumentStudioSettingsTabs } from "@/components/settings/DocumentStudioSettingsTabs";

import { DocumentStudioTemplateGallery } from "@/components/settings/DocumentStudioTemplateGallery";

import { DocumentStudioActiveTemplateCard } from "@/components/settings/DocumentStudioActiveTemplateCard";

import {
  applyDocumentStudioPreset,
  detectActiveDocumentStudioPreset,
  DOCUMENT_STUDIO_TYPES,
  getDocumentStudioPreset,
  type DocumentStudioDocumentType,
  type DocumentStudioPresetId,
} from "@/lib/documents/documentStudioPresets";

import { cn } from "@/lib/utils";



const ZOOM_OPTIONS: { value: QuotePreviewZoom; labelKey: string }[] = [

  { value: "fit", labelKey: "settings.quoteTemplate.zoomFit" },

  { value: "75", labelKey: "settings.quoteTemplate.zoom75" },

  { value: "100", labelKey: "settings.quoteTemplate.zoom100" },

];

type VisibilityKey = keyof QuoteDocumentTemplate["visibility"];



export function QuoteTemplateSettingsPanel() {

  const { t } = useI18n();

  const { user } = useAuth();

  const { activeWorkspace, workspaceRole } = useWorkspace();



  const orgId =

    activeWorkspace && isCompanyWorkspaceType(activeWorkspace.type)

      ? (activeWorkspace.orgId ?? activeWorkspace.id)

      : null;



  const canEdit =

    !!orgId && !!user?.id && (workspaceRole === "owner" || workspaceRole === "admin");



  const [loading, setLoading] = useState(true);

  const [saving, setSaving] = useState(false);

  const [error, setError] = useState<string | null>(null);

  const [success, setSuccess] = useState<string | null>(null);

  const [template, setTemplate] = useState<QuoteDocumentTemplate>(DEFAULT_QUOTE_TEMPLATE);

  const [savedTemplate, setSavedTemplate] = useState<QuoteDocumentTemplate>(DEFAULT_QUOTE_TEMPLATE);

  const [orgContext, setOrgContext] = useState<OrganizationQuoteDocumentContext | null>(null);

  const [templateLoadState, setTemplateLoadState] = useState<QuoteTemplateLoadState>("loading");



  const [settingsCollapsed, setSettingsCollapsed] = useState(false);

  const [previewFullWidth, setPreviewFullWidth] = useState(false);

  const [previewZoom, setPreviewZoom] = useState<QuotePreviewZoom>("fit");

  const [panelWidth, setPanelWidth] = useState(DEFAULT_EDITOR_PANEL_WIDTH);

  const [galleryOpen, setGalleryOpen] = useState(false);

  const [documentType, setDocumentType] = useState<DocumentStudioDocumentType>("quote");

  const [activePresetId, setActivePresetId] = useState<DocumentStudioPresetId | null>(null);



  const draggingRef = useRef(false);

  const dragStartXRef = useRef(0);

  const dragStartWidthRef = useRef(DEFAULT_EDITOR_PANEL_WIDTH);



  useEffect(() => {

    if (typeof window !== "undefined") {

      setPanelWidth(readEditorPanelWidth(window.localStorage));

    }

  }, []);



  useEffect(() => {

    if (!orgId) {

      setLoading(false);

      return;

    }

    setLoading(true);

    setError(null);

    setTemplateLoadState("loading");



    Promise.all([

      loadQuoteTemplateForSettings(orgId),

      loadOrganizationQuoteDocumentContext(orgId),

    ])

      .then(([templateResult, orgDoc]) => {

        const loaded = templateResult.template;

        setTemplate(loaded);

        setSavedTemplate(loaded);

        setOrgContext(orgDoc);

        setTemplateLoadState(templateResult.loadState);

        setActivePresetId(detectActiveDocumentStudioPreset(loaded));

      })

      .finally(() => setLoading(false));

  }, [orgId, t]);



  const previewTemplate = useMemo(() => normalizeQuoteTemplate(template), [template]);

  const isDirty = useMemo(

    () => !quoteTemplatesEqual(previewTemplate, savedTemplate),

    [previewTemplate, savedTemplate]

  );

  const statusBadge = useMemo(

    () =>

      resolveQuoteTemplateStatusBadge({

        loading,

        loadState: templateLoadState,

        isDirty,

      }),

    [loading, templateLoadState, isDirty]

  );

  const templateMessageKey = useMemo(

    () => resolveQuoteTemplateMessageKey(templateLoadState),

    [templateLoadState]

  );

  const templateMessageKind = useMemo(

    () => resolveQuoteTemplateMessageKind(templateLoadState),

    [templateLoadState]

  );

  const activePreset = useMemo(
    () => (activePresetId ? getDocumentStudioPreset(activePresetId) : null),
    [activePresetId]
  );

  const styleDescription = useMemo(() => {
    if (activePreset) return t(activePreset.styleSummaryKey);
    return t("settings.documentStudio.activeTemplate.customStyle");
  }, [activePreset, t]);

  const documentTypeLabel = t("settings.documentStudio.docType.quote");

  const templateDisplayName = useMemo(() => {
    if (activePreset) return t(activePreset.nameKey);
    return previewTemplate.name?.trim() || t("settings.documentStudio.activeTemplate.defaultName");
  }, [activePreset, previewTemplate.name, t]);



  const showSettingsPanel = !previewFullWidth && !settingsCollapsed;



  const patchSettings = (key: keyof QuoteDocumentTemplate["settings"], value: string | number) => {

    setActivePresetId(null);

    setTemplate((prev) => ({

      ...prev,

      settings: { ...prev.settings, [key]: value },

    }));

    setSuccess(null);

  };



  const patchTheme = (key: keyof QuoteDocumentTemplate["theme"], value: string) => {

    setActivePresetId(null);

    setTemplate((prev) => ({

      ...prev,

      theme: { ...prev.theme, [key]: value },

    }));

    setSuccess(null);

  };



  const patchLayout = <K extends keyof QuoteDocumentTemplate["layout"]>(

    key: K,

    value: QuoteDocumentTemplate["layout"][K]

  ) => {

    setActivePresetId(null);

    setTemplate((prev) => ({

      ...prev,

      layout: { ...prev.layout, [key]: value },

    }));

    setSuccess(null);

  };



  const patchVisibility = (key: VisibilityKey, value: boolean) => {

    setActivePresetId(null);

    setTemplate((prev) => ({

      ...prev,

      visibility: { ...prev.visibility, [key]: value },

    }));

    setSuccess(null);

  };



  const handleSave = async () => {

    if (!orgId || !user?.id || !canEdit) return;

    setSaving(true);

    setError(null);

    setSuccess(null);

    try {

      const saved = await saveDefaultQuoteTemplate(orgId, user.id, template);

      setTemplate(saved);

      setSavedTemplate(saved);

      setTemplateLoadState("loaded");

      setSuccess(t("settings.quoteTemplate.saved"));

    } catch (e) {

      setError(e instanceof Error ? e.message : t("settings.quoteTemplate.saveFailed"));

    } finally {

      setSaving(false);

    }

  };



  const handleReset = async () => {

    if (!orgId || !user?.id || !canEdit) return;

    setSaving(true);

    setError(null);

    setSuccess(null);

    try {

      const reset = await resetDefaultQuoteTemplate(orgId, user.id);

      setTemplate(reset);

      setSavedTemplate(reset);

      setTemplateLoadState("loaded");

      setActivePresetId(detectActiveDocumentStudioPreset(reset));

      setSuccess(t("settings.quoteTemplate.resetDone"));

    } catch (e) {

      setError(e instanceof Error ? e.message : t("settings.quoteTemplate.saveFailed"));

    } finally {

      setSaving(false);

    }

  };



  const handleTestPrint = () => {

    openQuoteSettingsTestPrint(

      previewTemplate,

      typeof sessionStorage !== "undefined" ? sessionStorage : null

    );

  };



  const handleApplyPreset = (presetId: DocumentStudioPresetId) => {

    setActivePresetId(presetId);

    setTemplate((prev) => applyDocumentStudioPreset(prev, presetId));

    setSuccess(null);

  };



  const handleSplitterMouseDown = useCallback(

    (event: React.MouseEvent) => {

      event.preventDefault();

      draggingRef.current = true;

      dragStartXRef.current = event.clientX;

      dragStartWidthRef.current = panelWidth;

    },

    [panelWidth]

  );



  useEffect(() => {

    const onMove = (event: MouseEvent) => {

      if (!draggingRef.current) return;

      const delta = event.clientX - dragStartXRef.current;

      const next = clampEditorPanelWidth(dragStartWidthRef.current + delta);

      setPanelWidth(next);

      writeEditorPanelWidth(next, typeof window !== "undefined" ? window.localStorage : null);

    };

    const onUp = () => {

      draggingRef.current = false;

    };

    window.addEventListener("mousemove", onMove);

    window.addEventListener("mouseup", onUp);

    return () => {

      window.removeEventListener("mousemove", onMove);

      window.removeEventListener("mouseup", onUp);

    };

  }, []);



  if (!orgId) {

    return (

      <p className="text-sm text-muted-foreground">{t("settings.quoteTemplate.companyOnly")}</p>

    );

  }



  if (loading) {

    return (

      <div className="flex flex-col items-center justify-center gap-3 py-16">

        <Loader2 className="size-8 animate-spin text-muted-foreground" />

        <p className="text-sm text-muted-foreground">{t("settings.quoteTemplate.statusLoading")}</p>

      </div>

    );

  }



  return (

    <div className="-mx-1 flex min-h-[calc(100dvh-7rem)] flex-col lg:min-h-[calc(100dvh-5.5rem)]">

      <div className="sticky top-0 z-30 border-b border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80">

        <div className="flex flex-wrap items-center gap-2 px-1 py-3">

          <div className="min-w-0 flex-1">

            <h1 className="text-xl font-semibold text-foreground sm:text-2xl">

              {t("settings.quoteTemplate.title")}

            </h1>

            <p className="mt-0.5 hidden text-sm text-muted-foreground sm:block">

              {t("settings.quoteTemplate.subtitle")}

            </p>

            <p className="mt-1 text-xs text-muted-foreground sm:hidden">

              {t("settings.documentStudio.badge")}

            </p>

          </div>

          <span

            className={cn(

              "rounded-full px-2.5 py-1 text-xs font-medium",

              statusBadge === "saved"

                ? "bg-emerald-50 text-emerald-800 border border-emerald-200"

                : statusBadge === "unsaved_changes"

                  ? "bg-amber-50 text-amber-800 border border-amber-200"

                  : statusBadge === "loading"

                    ? "bg-muted text-muted-foreground border border-border"

                    : statusBadge === "default_template"

                      ? "bg-slate-50 text-slate-700 border border-slate-200"

                      : "bg-amber-50 text-amber-900 border border-amber-200"

            )}

          >

            {t(resolveQuoteTemplateStatusBadgeKey(statusBadge))}

          </span>

          <Button

            type="button"

            size="sm"

            disabled={!canEdit || saving}

            onClick={() => void handleSave()}

            className={cn(
              "bg-[#e06737] hover:bg-[#c95a30] text-white transition-shadow",
              isDirty && "ring-2 ring-[#e06737]/50 ring-offset-2 shadow-md"
            )}

          >

            {saving ? <Loader2 className="size-4 mr-1 animate-spin" /> : <Save className="size-4 mr-1" />}

            {t("common.save")}

          </Button>

          <Button

            type="button"

            size="sm"

            variant="outline"

            disabled={!canEdit || saving}

            onClick={() => void handleReset()}

          >

            <RotateCcw className="size-4 mr-1" />

            {t("settings.quoteTemplate.reset")}

          </Button>

          <Button type="button" size="sm" variant="outline" onClick={handleTestPrint}>

            <Printer className="size-4 mr-1" />

            {t("settings.quoteTemplate.testPrintPdf")}

          </Button>

          <Button

            type="button"

            size="sm"

            variant="ghost"

            className="hidden lg:inline-flex"

            onClick={() => {

              setPreviewFullWidth((v) => !v);

              if (previewFullWidth) setSettingsCollapsed(false);

            }}

          >

            {previewFullWidth ? (

              <>

                <Minimize2 className="size-4 mr-1" />

                {t("settings.quoteTemplate.previewExitFullWidth")}

              </>

            ) : (

              <>

                <Maximize2 className="size-4 mr-1" />

                {t("settings.quoteTemplate.previewFullWidth")}

              </>

            )}

          </Button>

        </div>

        <div className="mx-1 flex gap-2 rounded-lg border border-[#1D376A]/15 bg-[#1D376A]/5 px-3 py-2.5">
          <Info className="mt-0.5 size-4 shrink-0 text-[#1D376A]" aria-hidden />
          <div className="min-w-0 text-xs leading-relaxed">
            <p className="font-semibold text-[#1D376A]">
              {t("settings.quoteTemplate.printCleanPdfTipTitle")}
            </p>
            <p className="mt-0.5 text-muted-foreground">
              {t("settings.quoteTemplate.printCleanPdfTip")}
            </p>
          </div>
        </div>

        {isDirty ? (
          <div className="mx-1 mb-1 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm font-medium text-amber-900">
            {t("settings.documentStudio.unsavedBanner")}
          </div>
        ) : null}

        <div className="flex flex-col gap-2 border-t border-border/60 px-1 py-2 sm:flex-row sm:flex-wrap sm:items-center">

          <div className="flex flex-wrap gap-1.5">
            {DOCUMENT_STUDIO_TYPES.map((docType) => (
              <button
                key={docType.id}
                type="button"
                disabled={!docType.available}
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-medium transition-colors sm:text-sm",
                  documentType === docType.id && docType.available
                    ? "border-[#1D376A] bg-[#1D376A] text-white"
                    : "border-border text-muted-foreground",
                  !docType.available && "cursor-not-allowed opacity-60"
                )}
                onClick={() => {
                  if (docType.available) setDocumentType(docType.id);
                }}
              >
                {t(docType.labelKey)}
                {!docType.available ? (
                  <Badge variant="secondary" className="px-1 py-0 text-[10px]">
                    {t("settings.documentStudio.comingSoon")}
                  </Badge>
                ) : null}
              </button>
            ))}
          </div>

          <Button
            type="button"
            size="sm"
            variant="outline"
            className="w-full sm:ml-auto sm:w-auto"
            disabled={!canEdit}
            onClick={() => setGalleryOpen(true)}
          >
            <LayoutTemplate className="mr-1.5 size-4" />
            {t("settings.documentStudio.chooseTemplate")}
          </Button>

        </div>

      </div>



      <div className="space-y-3 px-1 pt-3 shrink-0">

        {!canEdit ? (

          <p className="text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-4 py-3">

            {t("settings.quoteTemplate.readOnly")}

          </p>

        ) : null}

        <p className="text-sm text-[#1D376A] bg-[#1D376A]/5 border border-[#1D376A]/15 rounded-lg px-4 py-3">

          {t("settings.quoteTemplate.companyProfileInfo")}

        </p>

        {templateMessageKey && templateMessageKind === "info" ? (

          <p className="text-sm text-[#1D376A] bg-[#1D376A]/5 border border-[#1D376A]/15 rounded-lg px-4 py-3">

            {t(templateMessageKey)}

          </p>

        ) : null}

        {templateMessageKey && templateMessageKind === "warning" ? (

          <p className="text-sm text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-4 py-3">

            {t(templateMessageKey)}

          </p>

        ) : null}

        {error ? (

          <p className="text-sm text-destructive bg-destructive/10 border border-destructive/30 rounded-lg px-4 py-3">

            {error}

          </p>

        ) : null}

        {success ? (

          <p className="text-sm text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg px-4 py-3">

            {success}

          </p>

        ) : null}

      </div>



      <div className="mt-3 flex min-h-0 flex-1 flex-col border border-border rounded-xl overflow-hidden bg-background lg:flex-row">

        {showSettingsPanel ? (

          <>

            <aside

              className="flex min-h-[18rem] max-h-[42vh] shrink-0 flex-col border-b border-border lg:max-h-none lg:min-h-0 lg:border-b-0 lg:border-r"

              style={{ width: undefined }}

            >

              <div

                className="hidden lg:flex lg:min-h-0 lg:flex-1 lg:flex-col"

                style={{ width: panelWidth, maxWidth: panelWidth }}

              >

                <DocumentStudioActiveTemplateCard
                  templateName={templateDisplayName}
                  documentTypeLabel={documentTypeLabel}
                  isDirty={isDirty}
                  styleDescription={styleDescription}
                  t={t}
                />

                <div className="flex min-h-0 flex-1 flex-col overflow-hidden lg:flex">
                  <DocumentStudioSettingsTabs

                    template={template}

                    canEdit={canEdit}

                    t={t}

                    patchSettings={patchSettings}

                    patchTheme={patchTheme}

                    patchLayout={patchLayout}

                    patchVisibility={patchVisibility}

                  />

                </div>

              </div>

              <div className="lg:hidden flex-1 overflow-y-auto">

                <DocumentStudioActiveTemplateCard
                  templateName={templateDisplayName}
                  documentTypeLabel={documentTypeLabel}
                  isDirty={isDirty}
                  styleDescription={styleDescription}
                  t={t}
                />

                <DocumentStudioSettingsTabs

                  template={template}

                  canEdit={canEdit}

                  t={t}

                  patchSettings={patchSettings}

                  patchTheme={patchTheme}

                  patchLayout={patchLayout}

                  patchVisibility={patchVisibility}

                />

              </div>

            </aside>

            <div

              role="separator"

              aria-orientation="vertical"

              aria-label={t("settings.quoteTemplate.resizePanel")}

              className="hidden lg:block w-1.5 shrink-0 cursor-col-resize bg-border hover:bg-[#1D376A]/20 active:bg-[#1D376A]/30"

              onMouseDown={handleSplitterMouseDown}

            />

          </>

        ) : null}



        <section className="flex min-h-[28rem] flex-1 flex-col min-w-0 lg:min-h-0">

          <div className="flex flex-wrap items-center gap-2 border-b border-border px-3 py-2 shrink-0">

            <span className="mr-auto text-sm font-medium text-foreground">

              {t("settings.quoteTemplate.previewTitle")}

            </span>

            <div className="flex items-center gap-1 rounded-lg border border-border p-0.5">

              {ZOOM_OPTIONS.map(({ value, labelKey }) => (

                <button

                  key={value}

                  type="button"

                  className={cn(

                    "rounded-md px-2.5 py-1 text-xs font-medium transition-colors",

                    previewZoom === value

                      ? "bg-[#1D376A] text-white"

                      : "text-muted-foreground hover:bg-muted"

                  )}

                  onClick={() => setPreviewZoom(value)}

                >

                  {t(labelKey)}

                </button>

              ))}

            </div>

            <Button

              type="button"

              size="sm"

              variant="ghost"

              className="hidden lg:inline-flex"

              onClick={() => setSettingsCollapsed((v) => !v)}

            >

              {settingsCollapsed ? (

                <>

                  <ChevronRight className="size-4 mr-1" />

                  {t("settings.quoteTemplate.expandSettings")}

                </>

              ) : (

                <>

                  <ChevronLeft className="size-4 mr-1" />

                  {t("settings.quoteTemplate.collapseSettings")}

                </>

              )}

            </Button>

            <Button

              type="button"

              size="sm"

              variant="ghost"

              className="lg:hidden"

              onClick={() => setPreviewFullWidth((v) => !v)}

            >

              {previewFullWidth ? t("settings.quoteTemplate.previewExitFullWidth") : t("settings.quoteTemplate.previewFullWidth")}

            </Button>

          </div>

          <p className="px-3 py-1.5 text-xs text-muted-foreground shrink-0 border-b border-border/60">

            {t("settings.quoteTemplate.previewHint")}

          </p>

          <QuoteTemplatePreviewFrame zoom={previewZoom}>

            <QuoteTemplatePreview template={previewTemplate} organizationContext={orgContext} />

          </QuoteTemplatePreviewFrame>

        </section>

      </div>

      <DocumentStudioTemplateGallery
        open={galleryOpen}
        onOpenChange={setGalleryOpen}
        activePresetId={activePresetId}
        canEdit={canEdit}
        t={t}
        onApply={handleApplyPreset}
      />

    </div>

  );

}


