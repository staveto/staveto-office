"use client";

import { useState } from "react";
import { FileText, LayoutTemplate, Palette, Sparkles, ToggleRight } from "lucide-react";
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
import {
  ALLOWED_QUOTE_TEMPLATE_FONTS,
  type QuoteDocumentTemplate,
  type QuoteTemplateHeaderLayout,
  type QuoteTemplateLogoSize,
  type QuoteTemplateSignatureLayout,
  type QuoteTemplateTotalsLayout,
} from "@/lib/documents/quoteTemplateContract";
import { SettingsSectionCard } from "@/components/settings/SettingsSectionCard";
import { settingsAccentIconClassName } from "@/components/settings/settingsStyles";
import { DocumentStudioAiPanel } from "@/components/settings/DocumentStudioAiPanel";
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

const CORE_VISIBILITY_KEYS: VisibilityKey[] = [
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

const SALES_VISIBILITY_KEYS: VisibilityKey[] = [
  "showIntroMessage",
  "showIncludedInPrice",
  "showNotIncludedInPrice",
  "showTimeline",
  "showPaymentMilestones",
  "showWhyChooseUs",
  "showReferences",
  "showCallToAction",
];

type StudioTab = "basic" | "brand" | "layout" | "sections" | "ai";

const TABS: { id: StudioTab; labelKey: string; icon: typeof FileText }[] = [
  { id: "basic", labelKey: "settings.documentStudio.tab.basic", icon: FileText },
  { id: "brand", labelKey: "settings.documentStudio.tab.brand", icon: Palette },
  { id: "layout", labelKey: "settings.documentStudio.tab.layout", icon: LayoutTemplate },
  { id: "sections", labelKey: "settings.documentStudio.tab.sections", icon: ToggleRight },
  { id: "ai", labelKey: "settings.documentStudio.tab.ai", icon: Sparkles },
];

type DocumentStudioSettingsTabsProps = {
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
};

export function DocumentStudioSettingsTabs({
  template,
  canEdit,
  t,
  patchSettings,
  patchTheme,
  patchLayout,
  patchVisibility,
}: DocumentStudioSettingsTabsProps) {
  const [activeTab, setActiveTab] = useState<StudioTab>("basic");
  const [aiChecking, setAiChecking] = useState(false);

  const handleAiCheck = () => {
    setAiChecking(true);
    window.setTimeout(() => setAiChecking(false), 1200);
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div
        className="flex gap-1 overflow-x-auto border-b border-border px-2 py-2 shrink-0"
        role="tablist"
        aria-label={t("settings.documentStudio.tabsLabel")}
      >
        {TABS.map(({ id, labelKey, icon: Icon }) => (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={activeTab === id}
            className={cn(
              "inline-flex shrink-0 items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-medium transition-colors sm:text-sm",
              activeTab === id
                ? "bg-[#1D376A] text-white"
                : "text-muted-foreground hover:bg-muted hover:text-foreground"
            )}
            onClick={() => setActiveTab(id)}
          >
            <Icon className="size-3.5 sm:size-4" aria-hidden />
            {t(labelKey)}
          </button>
        ))}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {activeTab === "basic" ? (
          <div className="space-y-4 p-4 lg:p-5">
            <SettingsSectionCard>
              <CardContent className="pt-6">
                <div className="mb-4 flex items-center gap-2">
                  <FileText className={settingsAccentIconClassName} />
                  <h2 className="font-semibold text-foreground">
                    {t("settings.quoteTemplate.defaultsTitle")}
                  </h2>
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
          </div>
        ) : null}

        {activeTab === "brand" ? (
          <div className="space-y-4 p-4 lg:p-5">
            <SettingsSectionCard>
              <CardContent className="pt-6">
                <h2 className="mb-4 font-semibold text-foreground">
                  {t("settings.quoteTemplate.themeTitle")}
                </h2>
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
          </div>
        ) : null}

        {activeTab === "layout" ? (
          <div className="space-y-4 p-4 lg:p-5">
            <SettingsSectionCard>
              <CardContent className="pt-6">
                <h2 className="mb-4 font-semibold text-foreground">
                  {t("settings.quoteTemplate.layoutTitle")}
                </h2>
                <div className="grid gap-4">
                  <div>
                    <Label>{t("settings.quoteTemplate.headerLayout")}</Label>
                    <Select
                      value={template.layout.headerLayout}
                      disabled={!canEdit}
                      onValueChange={(v) =>
                        patchLayout(
                          "headerLayout",
                          (v as QuoteTemplateHeaderLayout) ?? "logo-left-company-right"
                        )
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
                        onValueChange={(v) =>
                          patchLayout("logoSize", (v as QuoteTemplateLogoSize) ?? "medium")
                        }
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
                        onValueChange={(v) =>
                          patchLayout("tableDensity", v === "compact" ? "compact" : "normal")
                        }
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="compact">
                            {t("settings.quoteTemplate.sizeCompact")}
                          </SelectItem>
                          <SelectItem value="normal">
                            {t("settings.quoteTemplate.sizeNormal")}
                          </SelectItem>
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
                          patchLayout(
                            "signatureLayout",
                            (v as QuoteTemplateSignatureLayout) ?? "classic"
                          )
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
          </div>
        ) : null}

        {activeTab === "sections" ? (
          <div className="space-y-4 p-4 lg:p-5">
            <SettingsSectionCard>
              <CardContent className="pt-6">
                <h2 className="mb-1 font-semibold text-foreground">
                  {t("settings.quoteTemplate.sectionsTitle")}
                </h2>
                <p className="mb-4 text-sm text-muted-foreground">
                  {t("settings.documentStudio.sections.hint")}
                </p>
                <h3 className="mb-2 text-sm font-medium text-foreground">
                  {t("settings.documentStudio.sections.coreTitle")}
                </h3>
                <div className="mb-5 grid gap-3">
                  {CORE_VISIBILITY_KEYS.map((key) => (
                    <VisibilityToggle
                      key={key}
                      visibilityKey={key}
                      checked={template.visibility[key]}
                      canEdit={canEdit}
                      t={t}
                      onChange={(value) => patchVisibility(key, value)}
                    />
                  ))}
                </div>
                <h3 className="mb-2 text-sm font-medium text-foreground">
                  {t("settings.documentStudio.sections.salesTitle")}
                </h3>
                <div className="grid gap-3">
                  {SALES_VISIBILITY_KEYS.map((key) => (
                    <VisibilityToggle
                      key={key}
                      visibilityKey={key}
                      checked={template.visibility[key]}
                      canEdit={canEdit}
                      t={t}
                      onChange={(value) => patchVisibility(key, value)}
                    />
                  ))}
                </div>
              </CardContent>
            </SettingsSectionCard>
          </div>
        ) : null}

        {activeTab === "ai" ? (
          <DocumentStudioAiPanel
            t={t}
            canEdit={canEdit}
            checking={aiChecking}
            onCheck={handleAiCheck}
          />
        ) : null}
      </div>
    </div>
  );
}

function VisibilityToggle({
  visibilityKey,
  checked,
  canEdit,
  t,
  onChange,
}: {
  visibilityKey: VisibilityKey;
  checked: boolean;
  canEdit: boolean;
  t: (key: string) => string;
  onChange: (value: boolean) => void;
}) {
  return (
    <label className="flex items-center justify-between gap-3 rounded-lg border border-border px-3 py-2.5 transition-colors hover:bg-muted/30">
      <span className="text-sm text-foreground">
        {t(`settings.quoteTemplate.visibility.${visibilityKey}`)}
      </span>
      <input
        type="checkbox"
        checked={checked}
        disabled={!canEdit}
        onChange={(e) => onChange(e.target.checked)}
        className="size-4 accent-[#1D376A]"
      />
    </label>
  );
}
