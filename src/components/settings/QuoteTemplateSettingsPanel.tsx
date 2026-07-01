"use client";



import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import {

  ChevronLeft,

  ChevronRight,

  FileText,

  Loader2,

  Maximize2,

  Minimize2,

  Printer,

  RotateCcw,

  Save,

} from "lucide-react";

import { Button } from "@/components/ui/button";

import { Input } from "@/components/ui/input";

import { Label } from "@/components/ui/label";

import { Textarea } from "@/components/ui/textarea";

import { CardContent } from "@/components/ui/card";

import {

  Select,

  SelectContent,

  SelectItem,

  SelectTrigger,

  SelectValue,

} from "@/components/ui/select";

import { useAuth } from "@/context/AuthContext";

import { useWorkspace } from "@/context/WorkspaceContext";

import { useI18n } from "@/i18n/I18nContext";

import { isCompanyWorkspaceType } from "@/types/workspace";

import {

  ALLOWED_QUOTE_TEMPLATE_FONTS,

  DEFAULT_QUOTE_TEMPLATE,

  normalizeQuoteTemplate,

  type QuoteDocumentTemplate,

  type QuoteTemplateHeaderLayout,

  type QuoteTemplateLogoSize,

  type QuoteTemplateSignatureLayout,

  type QuoteTemplateTotalsLayout,

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

import { SettingsSectionCard } from "@/components/settings/SettingsSectionCard";

import { settingsAccentIconClassName } from "@/components/settings/settingsStyles";

import { cn } from "@/lib/utils";



const HEADER_LAYOUTS: QuoteTemplateHeaderLayout[] = [

  "logo-left-company-right",

  "company-left-logo-right",

  "centered",

];



const LOGO_SIZES: QuoteTemplateLogoSize[] = ["small", "medium", "large"];

const TOTALS_LAYOUTS: QuoteTemplateTotalsLayout[] = ["right", "full-width"];

const SIGNATURE_LAYOUTS: QuoteTemplateSignatureLayout[] = ["classic", "modern"];



type VisibilityKey = keyof QuoteDocumentTemplate["visibility"];



const VISIBILITY_KEYS: VisibilityKey[] = [

  "showLogo",

  "showCompanyAddress",

  "showRegistrationNumber",

  "showContactPerson",

  "showCustomerNumber",

  "showProjectNumber",

  "showCurrency",

  "showSummary",

  "showScopeOfWork",

  "showMaterialSection",

  "showWorkSection",

  "showTerms",

  "showContactBlock",

  "showSignatureBlock",

  "showStavetoBranding",

];



const ZOOM_OPTIONS: { value: QuotePreviewZoom; labelKey: string }[] = [

  { value: "fit", labelKey: "settings.quoteTemplate.zoomFit" },

  { value: "75", labelKey: "settings.quoteTemplate.zoom75" },

  { value: "100", labelKey: "settings.quoteTemplate.zoom100" },

];



function SettingsFormSections({

  template,

  canEdit,

  t,

  patchSettings,

  patchTheme,

  patchLayout,

  patchVisibility,

}: {

  template: QuoteDocumentTemplate;

  canEdit: boolean;

  t: (key: string) => string;

  patchSettings: (key: keyof QuoteDocumentTemplate["settings"], value: string | number) => void;

  patchTheme: (key: keyof QuoteDocumentTemplate["theme"], value: string) => void;

  patchLayout: <K extends keyof QuoteDocumentTemplate["layout"]>(

    key: K,

    value: QuoteDocumentTemplate["layout"][K]

  ) => void;

  patchVisibility: (key: VisibilityKey, value: boolean) => void;

}) {

  return (

    <div className="space-y-6 p-4 lg:p-5">

      <SettingsSectionCard>

        <CardContent className="pt-6">

          <div className="flex items-center gap-2 mb-4">

            <FileText className={settingsAccentIconClassName} />

            <h2 className="font-semibold text-[#1D376A]">{t("settings.quoteTemplate.defaultsTitle")}</h2>

          </div>

          <div className="grid gap-4">

            <div>

              <Label htmlFor="validityDays">{t("settings.quoteTemplate.validityDays")}</Label>

              <Input

                id="validityDays"

                type="number"

                min={1}

                max={365}

                value={template.settings.defaultValidityDays}

                disabled={!canEdit}

                onChange={(e) =>

                  patchSettings("defaultValidityDays", Number(e.target.value) || 14)

                }

              />

            </div>

            <div>

              <Label htmlFor="quoteTitle">{t("settings.quoteTemplate.quoteTitle")}</Label>

              <Input

                id="quoteTitle"

                value={template.settings.defaultQuoteTitle}

                disabled={!canEdit}

                placeholder={t("quotes.print.title")}

                onChange={(e) => patchSettings("defaultQuoteTitle", e.target.value)}

              />

            </div>

            <div>

              <Label htmlFor="terms">{t("settings.quoteTemplate.terms")}</Label>

              <Textarea

                id="terms"

                rows={4}

                value={template.settings.defaultTermsText}

                disabled={!canEdit}

                onChange={(e) => patchSettings("defaultTermsText", e.target.value)}

              />

            </div>

            <div>

              <Label htmlFor="payment">{t("settings.quoteTemplate.paymentNote")}</Label>

              <Textarea

                id="payment"

                rows={2}

                value={template.settings.defaultPaymentNote}

                disabled={!canEdit}

                onChange={(e) => patchSettings("defaultPaymentNote", e.target.value)}

              />

            </div>

            <div>

              <Label htmlFor="footer">{t("settings.quoteTemplate.footer")}</Label>

              <Textarea

                id="footer"

                rows={2}

                value={template.settings.defaultFooterText}

                disabled={!canEdit}

                onChange={(e) => patchSettings("defaultFooterText", e.target.value)}

              />

            </div>

          </div>

        </CardContent>

      </SettingsSectionCard>



      <SettingsSectionCard>

        <CardContent className="pt-6">

          <h2 className="font-semibold text-[#1D376A] mb-4">{t("settings.quoteTemplate.themeTitle")}</h2>

          <div className="grid gap-4 sm:grid-cols-2">

            {(

              [

                ["primaryColor", t("settings.quoteTemplate.primaryColor")],

                ["accentColor", t("settings.quoteTemplate.accentColor")],

                ["textColor", t("settings.quoteTemplate.textColor")],

                ["mutedTextColor", t("settings.quoteTemplate.mutedColor")],

                ["borderColor", t("settings.quoteTemplate.borderColor")],

              ] as const

            ).map(([key, label]) => (

              <div key={key}>

                <Label htmlFor={key}>{label}</Label>

                <Input

                  id={key}

                  type="color"

                  value={template.theme[key]}

                  disabled={!canEdit}

                  onChange={(e) => patchTheme(key, e.target.value)}

                  className="h-10 p-1"

                />

              </div>

            ))}

            <div>

              <Label>{t("settings.quoteTemplate.font")}</Label>

              <Select

                value={template.theme.fontFamily}

                disabled={!canEdit}

                onValueChange={(v) => patchTheme("fontFamily", v ?? "Inter")}

              >

                <SelectTrigger>

                  <SelectValue />

                </SelectTrigger>

                <SelectContent>

                  {ALLOWED_QUOTE_TEMPLATE_FONTS.map((font) => (

                    <SelectItem key={font} value={font}>

                      {font}

                    </SelectItem>

                  ))}

                </SelectContent>

              </Select>

            </div>

            <div>

              <Label>{t("settings.quoteTemplate.fontSize")}</Label>

              <Select

                value={template.theme.fontSize}

                disabled={!canEdit}

                onValueChange={(v) => patchTheme("fontSize", v ?? "normal")}

              >

                <SelectTrigger>

                  <SelectValue />

                </SelectTrigger>

                <SelectContent>

                  <SelectItem value="compact">{t("settings.quoteTemplate.sizeCompact")}</SelectItem>

                  <SelectItem value="normal">{t("settings.quoteTemplate.sizeNormal")}</SelectItem>

                  <SelectItem value="large">{t("settings.quoteTemplate.sizeLarge")}</SelectItem>

                </SelectContent>

              </Select>

            </div>

          </div>

        </CardContent>

      </SettingsSectionCard>



      <SettingsSectionCard>

        <CardContent className="pt-6">

          <h2 className="font-semibold text-[#1D376A] mb-4">{t("settings.quoteTemplate.layoutTitle")}</h2>

          <div className="grid gap-4">

            <div>

              <Label>{t("settings.quoteTemplate.headerLayout")}</Label>

              <Select

                value={template.layout.headerLayout}

                disabled={!canEdit}

                onValueChange={(v) =>

                  patchLayout("headerLayout", (v as QuoteTemplateHeaderLayout) ?? "logo-left-company-right")

                }

              >

                <SelectTrigger>

                  <SelectValue />

                </SelectTrigger>

                <SelectContent>

                  {HEADER_LAYOUTS.map((layout) => (

                    <SelectItem key={layout} value={layout}>

                      {t(`settings.quoteTemplate.header.${layout}`)}

                    </SelectItem>

                  ))}

                </SelectContent>

              </Select>

            </div>

            <div className="grid gap-4 sm:grid-cols-2">

              <div>

                <Label>{t("settings.quoteTemplate.logoSize")}</Label>

                <Select

                  value={template.layout.logoSize}

                  disabled={!canEdit}

                  onValueChange={(v) => patchLayout("logoSize", (v as QuoteTemplateLogoSize) ?? "medium")}

                >

                  <SelectTrigger>

                    <SelectValue />

                  </SelectTrigger>

                  <SelectContent>

                    {LOGO_SIZES.map((size) => (

                      <SelectItem key={size} value={size}>

                        {t(`settings.quoteTemplate.logo.${size}`)}

                      </SelectItem>

                    ))}

                  </SelectContent>

                </Select>

              </div>

              <div>

                <Label>{t("settings.quoteTemplate.tableDensity")}</Label>

                <Select

                  value={template.layout.tableDensity}

                  disabled={!canEdit}

                  onValueChange={(v) => patchLayout("tableDensity", v === "compact" ? "compact" : "normal")}

                >

                  <SelectTrigger>

                    <SelectValue />

                  </SelectTrigger>

                  <SelectContent>

                    <SelectItem value="compact">{t("settings.quoteTemplate.sizeCompact")}</SelectItem>

                    <SelectItem value="normal">{t("settings.quoteTemplate.sizeNormal")}</SelectItem>

                  </SelectContent>

                </Select>

              </div>

            </div>

            <div className="grid gap-4 sm:grid-cols-2">

              <div>

                <Label>{t("settings.quoteTemplate.totalsLayout")}</Label>

                <Select

                  value={template.layout.totalsLayout}

                  disabled={!canEdit}

                  onValueChange={(v) =>

                    patchLayout("totalsLayout", (v as QuoteTemplateTotalsLayout) ?? "right")

                  }

                >

                  <SelectTrigger>

                    <SelectValue />

                  </SelectTrigger>

                  <SelectContent>

                    {TOTALS_LAYOUTS.map((layout) => (

                      <SelectItem key={layout} value={layout}>

                        {t(`settings.quoteTemplate.totals.${layout}`)}

                      </SelectItem>

                    ))}

                  </SelectContent>

                </Select>

              </div>

              <div>

                <Label>{t("settings.quoteTemplate.signatureLayout")}</Label>

                <Select

                  value={template.layout.signatureLayout}

                  disabled={!canEdit}

                  onValueChange={(v) =>

                    patchLayout("signatureLayout", (v as QuoteTemplateSignatureLayout) ?? "classic")

                  }

                >

                  <SelectTrigger>

                    <SelectValue />

                  </SelectTrigger>

                  <SelectContent>

                    {SIGNATURE_LAYOUTS.map((layout) => (

                      <SelectItem key={layout} value={layout}>

                        {t(`settings.quoteTemplate.signature.${layout}`)}

                      </SelectItem>

                    ))}

                  </SelectContent>

                </Select>

              </div>

            </div>

          </div>

        </CardContent>

      </SettingsSectionCard>



      <SettingsSectionCard>

        <CardContent className="pt-6">

          <h2 className="font-semibold text-[#1D376A] mb-4">{t("settings.quoteTemplate.sectionsTitle")}</h2>

          <div className="grid gap-3 sm:grid-cols-1">

            {VISIBILITY_KEYS.map((key) => (

              <label key={key} className="flex items-center justify-between gap-3 rounded-lg border px-3 py-2">

                <span className="text-sm">{t(`settings.quoteTemplate.visibility.${key}`)}</span>

                <input

                  type="checkbox"

                  checked={template.visibility[key]}

                  disabled={!canEdit}

                  onChange={(e) => patchVisibility(key, e.target.checked)}

                  className="size-4 accent-[#1D376A]"

                />

              </label>

            ))}

          </div>

        </CardContent>

      </SettingsSectionCard>

    </div>

  );

}



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



  const showSettingsPanel = !previewFullWidth && !settingsCollapsed;



  const patchSettings = (key: keyof QuoteDocumentTemplate["settings"], value: string | number) => {

    setTemplate((prev) => ({

      ...prev,

      settings: { ...prev.settings, [key]: value },

    }));

    setSuccess(null);

  };



  const patchTheme = (key: keyof QuoteDocumentTemplate["theme"], value: string) => {

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

    setTemplate((prev) => ({

      ...prev,

      layout: { ...prev.layout, [key]: value },

    }));

    setSuccess(null);

  };



  const patchVisibility = (key: VisibilityKey, value: boolean) => {

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

            <h1 className="text-xl font-semibold text-[#1D376A] sm:text-2xl">

              {t("settings.quoteTemplate.title")}

            </h1>

            <p className="text-sm text-muted-foreground mt-0.5 hidden sm:block">

              {t("settings.quoteTemplate.subtitle")}

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

            className="bg-[#e06737] hover:bg-[#c95a30] text-white"

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

                <div className="flex-1 overflow-y-auto">{/* lg scroll */}

                  <SettingsFormSections

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

                <SettingsFormSections

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

            <span className="text-sm font-medium text-[#1D376A] mr-auto">

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

    </div>

  );

}


