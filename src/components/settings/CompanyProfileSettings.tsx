"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Building2, ImagePlus, Loader2, Save, Trash2 } from "lucide-react";
import {
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
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
  loadCompanyProfile,
  saveCompanyProfile,
  uploadCompanyLogo,
  removeCompanyLogo,
  type OrganizationProfile,
} from "@/services/organization";
import type { OrganizationMarketProfile, SupportedCountryCode } from "@/lib/market/marketProfileContract";
import { resolveOrganizationMarketPreview } from "@/lib/market/companyMarketConfig";
import {
  COUNTRY_OPTIONS,
  resolveSupportedCountryCode,
} from "@/lib/market/countryOptions";
import { mapCompanyLogoError } from "@/lib/companyProfileErrors";
import { CompanyMarketProfileSections } from "./CompanyMarketProfileSections";
import { SettingsSectionCard } from "./SettingsSectionCard";
import { settingsAccentIconClassName } from "./settingsStyles";
import { cn } from "@/lib/utils";

const emptyProfile = (): OrganizationProfile => ({});

const emptyMarket = (): OrganizationMarketProfile => ({
  countryCode: null,
  currency: null,
  timezone: null,
  locale: null,
  defaultLanguage: null,
  taxProfile: null,
  legalProfile: null,
  marketConfigVersion: null,
});

export function CompanyProfileSettings() {
  const { t, locale } = useI18n();
  const { user } = useAuth();
  const { activeWorkspace, workspaceRole } = useWorkspace();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const orgId =
    activeWorkspace && isCompanyWorkspaceType(activeWorkspace.type)
      ? (activeWorkspace.orgId ?? activeWorkspace.id)
      : null;

  const canEdit =
    !!orgId && !!user?.id && (workspaceRole === "owner" || workspaceRole === "admin");

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [logoBusy, setLogoBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [profile, setProfile] = useState<OrganizationProfile>(emptyProfile());
  const [countryCode, setCountryCode] = useState<SupportedCountryCode | "">("");
  const [savedRootCountryCode, setSavedRootCountryCode] = useState<string | null>(null);
  const [loadedMarket, setLoadedMarket] = useState<OrganizationMarketProfile>(emptyMarket());

  const uiLocale = locale === "sk" || locale === "de" ? locale : "en";

  const marketPreview = useMemo(
    () =>
      resolveOrganizationMarketPreview(
        {
          ...loadedMarket,
          countryCode: countryCode || loadedMarket.countryCode,
          profile: { country: profile.country },
        },
        countryCode || null,
        uiLocale
      ),
    [loadedMarket, countryCode, profile.country, uiLocale]
  );

  useEffect(() => {
    if (!orgId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    loadCompanyProfile(orgId)
      .then((org) => {
        const loaded = org?.profile ?? emptyProfile();
        if (!loaded.legalName?.trim() && org?.name?.trim()) {
          loaded.legalName = org.name.trim();
        }
        const resolved = resolveSupportedCountryCode(
          org?.market.countryCode,
          loaded.country
        );
        setProfile(loaded);
        setCountryCode(resolved ?? "");
        setSavedRootCountryCode(org?.market.countryCode ?? resolved ?? null);
        setLoadedMarket(org?.market ?? emptyMarket());
      })
      .catch(() => setError(t("settings.companyProfile.loadError")))
      .finally(() => setLoading(false));
  }, [orgId, t]);

  const patch = (key: keyof OrganizationProfile, value: string) => {
    setProfile((prev) => ({ ...prev, [key]: value }));
    setSuccess(null);
  };

  const handleSave = async () => {
    if (!orgId || !user?.id || !canEdit) return;

    if (
      savedRootCountryCode &&
      countryCode &&
      savedRootCountryCode !== countryCode &&
      !window.confirm(t("settings.companyMarket.countryChangeConfirm"))
    ) {
      return;
    }

    setSaving(true);
    setError(null);
    setSuccess(null);
    try {
      const saved = await saveCompanyProfile(orgId, user.id, {
        ...profile,
        countryCode: countryCode || null,
        country: countryCode || profile.country,
      });
      if (saved) {
        const loaded = saved.profile ?? emptyProfile();
        const resolved = resolveSupportedCountryCode(
          saved.market.countryCode,
          loaded.country
        );
        setProfile(loaded);
        setCountryCode(resolved ?? "");
        setSavedRootCountryCode(saved.market.countryCode ?? resolved ?? null);
        setLoadedMarket(saved.market);
      }
      setSuccess(t("settings.companyProfile.saved"));
    } catch (e) {
      setError(e instanceof Error ? e.message : t("settings.companyProfile.saveError"));
    } finally {
      setSaving(false);
    }
  };

  const handleLogoPick = async (file: File | undefined) => {
    if (!file || !orgId || !user?.id || !canEdit) return;
    setLogoBusy(true);
    setError(null);
    setSuccess(null);
    try {
      const res = await uploadCompanyLogo(orgId, user.id, file, profile);
      setProfile((prev) => ({
        ...prev,
        logoUrl: res.logoUrl,
        logoStoragePath: res.logoStoragePath,
      }));
      setSuccess(t("settings.companyProfile.logoSaved"));
    } catch (e) {
      setError(t(mapCompanyLogoError(e)));
    } finally {
      setLogoBusy(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const handleRemoveLogo = async () => {
    if (!orgId || !user?.id || !canEdit) return;
    setLogoBusy(true);
    setError(null);
    try {
      await removeCompanyLogo(orgId, user.id, profile);
      setProfile((prev) => ({
        ...prev,
        logoUrl: undefined,
        logoStoragePath: undefined,
      }));
    } catch (e) {
      setError(e instanceof Error ? e.message : t("settings.companyProfile.logoError"));
    } finally {
      setLogoBusy(false);
    }
  };

  const countryOptionLabel = (code: SupportedCountryCode) => {
    const option = COUNTRY_OPTIONS.find((o) => o.countryCode === code);
    if (!option) return code;
    const name = uiLocale === "sk" ? option.nativeName : option.englishName;
    return `${code} — ${name}`;
  };

  if (!orgId) {
    return (
      <SettingsSectionCard>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Building2 className={cn("size-4", settingsAccentIconClassName)} aria-hidden />
            {t("settings.companyProfile.title")}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">{t("settings.companyProfile.teamOnly")}</p>
        </CardContent>
      </SettingsSectionCard>
    );
  }

  return (
    <SettingsSectionCard id="company-profile">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Building2 className={cn("size-4", settingsAccentIconClassName)} aria-hidden />
          {t("settings.companyProfile.title")}
        </CardTitle>
        <CardDescription>{t("settings.companyProfile.description")}</CardDescription>
        {activeWorkspace?.name ? (
          <p className="text-sm text-muted-foreground pt-1">
            {t("settings.companyProfile.companyLabel")}:{" "}
            <span className="font-medium text-foreground">{activeWorkspace.name}</span>
          </p>
        ) : null}
      </CardHeader>
      <CardContent className="space-y-6">
        {loading ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" />
            {t("common.loading")}
          </div>
        ) : (
          <>
            {!canEdit ? (
              <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800 dark:border-amber-800/50 dark:bg-amber-950/35 dark:text-amber-100">
                {t("settings.companyProfile.adminOnly")}
              </p>
            ) : null}

            <div className="space-y-3">
              <Label>{t("settings.companyProfile.logo")}</Label>
              <div className="flex flex-wrap items-center gap-4">
                <div className="flex size-20 items-center justify-center rounded-lg border bg-muted/30 overflow-hidden">
                  {profile.logoUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={profile.logoUrl}
                      alt=""
                      className="max-h-20 max-w-full object-contain p-1"
                    />
                  ) : (
                    <Building2 className="size-8 text-muted-foreground/50" aria-hidden />
                  )}
                </div>
                <div className="flex flex-wrap gap-2">
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/png,image/jpeg,image/webp,image/svg+xml"
                    className="hidden"
                    disabled={!canEdit || logoBusy}
                    onChange={(e) => void handleLogoPick(e.target.files?.[0])}
                  />
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={!canEdit || logoBusy}
                    onClick={() => fileInputRef.current?.click()}
                  >
                    {logoBusy ? (
                      <Loader2 className="size-4 mr-1 animate-spin" />
                    ) : (
                      <ImagePlus className="size-4 mr-1" />
                    )}
                    {t("settings.companyProfile.uploadLogo")}
                  </Button>
                  {profile.logoUrl ? (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      disabled={!canEdit || logoBusy}
                      onClick={() => void handleRemoveLogo()}
                    >
                      <Trash2 className="size-4 mr-1" />
                      {t("settings.companyProfile.removeLogo")}
                    </Button>
                  ) : null}
                </div>
              </div>
              <p className="text-xs text-muted-foreground">{t("settings.companyProfile.logoHint")}</p>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="sm:col-span-2 space-y-2">
                <Label htmlFor="cp-legalName">{t("settings.companyProfile.legalName")}</Label>
                <Input
                  id="cp-legalName"
                  value={profile.legalName ?? ""}
                  disabled={!canEdit}
                  onChange={(e) => patch("legalName", e.target.value)}
                />
              </div>
              <div className="sm:col-span-2 space-y-2">
                <Label htmlFor="cp-address">{t("settings.companyProfile.address")}</Label>
                <Input
                  id="cp-address"
                  value={profile.addressText ?? ""}
                  disabled={!canEdit}
                  onChange={(e) => patch("addressText", e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="cp-city">{t("settings.companyProfile.city")}</Label>
                <Input
                  id="cp-city"
                  value={profile.city ?? ""}
                  disabled={!canEdit}
                  onChange={(e) => patch("city", e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="cp-zip">{t("settings.companyProfile.zip")}</Label>
                <Input
                  id="cp-zip"
                  value={profile.zip ?? ""}
                  disabled={!canEdit}
                  onChange={(e) => patch("zip", e.target.value)}
                />
              </div>
              <div className="sm:col-span-2 space-y-2">
                <Label htmlFor="cp-country">{t("settings.companyProfile.registeredCountry")}</Label>
                <Select
                  value={countryCode || undefined}
                  disabled={!canEdit}
                  onValueChange={(value) => {
                    const next = value as SupportedCountryCode;
                    setCountryCode(next);
                    setProfile((prev) => ({ ...prev, country: next }));
                    setSuccess(null);
                  }}
                >
                  <SelectTrigger id="cp-country" data-testid="company-country-select">
                    <SelectValue placeholder={t("settings.companyMarket.selectCountry")} />
                  </SelectTrigger>
                  <SelectContent>
                    {COUNTRY_OPTIONS.map((option) => (
                      <SelectItem key={option.countryCode} value={option.countryCode}>
                        {countryOptionLabel(option.countryCode)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <CompanyMarketProfileSections preview={marketPreview} t={t} />

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="cp-reg">
                  {marketPreview.registrationNumberLabel !== "—"
                    ? marketPreview.registrationNumberLabel
                    : t("settings.companyProfile.registrationNumber")}
                </Label>
                <Input
                  id="cp-reg"
                  value={profile.registrationNumber ?? ""}
                  disabled={!canEdit}
                  onChange={(e) => patch("registrationNumber", e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="cp-tax">
                  {marketPreview.taxIdLabel !== "—"
                    ? marketPreview.taxIdLabel
                    : t("settings.companyProfile.taxId")}
                </Label>
                <Input
                  id="cp-tax"
                  value={profile.taxId ?? ""}
                  disabled={!canEdit}
                  onChange={(e) => patch("taxId", e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="cp-vat">
                  {marketPreview.vatIdLabel !== "—"
                    ? marketPreview.vatIdLabel
                    : t("settings.companyProfile.vatId")}
                </Label>
                <Input
                  id="cp-vat"
                  value={profile.vatId ?? ""}
                  disabled={!canEdit}
                  onChange={(e) => patch("vatId", e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="cp-contact">{t("settings.companyProfile.contactName")}</Label>
                <Input
                  id="cp-contact"
                  value={profile.contactName ?? ""}
                  disabled={!canEdit}
                  onChange={(e) => patch("contactName", e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="cp-phone">{t("settings.companyProfile.phone")}</Label>
                <Input
                  id="cp-phone"
                  value={profile.phone ?? ""}
                  disabled={!canEdit}
                  onChange={(e) => patch("phone", e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="cp-email">{t("settings.companyProfile.email")}</Label>
                <Input
                  id="cp-email"
                  type="email"
                  value={profile.email ?? ""}
                  disabled={!canEdit}
                  onChange={(e) => patch("email", e.target.value)}
                />
              </div>
              <div className="sm:col-span-2 space-y-2">
                <Label htmlFor="cp-web">{t("settings.companyProfile.website")}</Label>
                <Input
                  id="cp-web"
                  value={profile.websiteUrl ?? ""}
                  disabled={!canEdit}
                  onChange={(e) => patch("websiteUrl", e.target.value)}
                />
              </div>
              <div className="sm:col-span-2 space-y-2">
                <Label htmlFor="cp-bank">{t("settings.companyProfile.bankAccount")}</Label>
                <Input
                  id="cp-bank"
                  value={profile.bankAccount ?? ""}
                  disabled={!canEdit}
                  onChange={(e) => patch("bankAccount", e.target.value)}
                  placeholder={t("settings.companyProfile.bankAccountPlaceholder")}
                />
              </div>
            </div>

            {canEdit ? (
              <div className="space-y-2">
                <p className="text-xs text-muted-foreground">{t("settings.companyProfile.saveHint")}</p>
                <Button
                  type="button"
                  disabled={saving}
                  className="bg-[#e06737] hover:bg-[#c95a30] text-white"
                  onClick={() => void handleSave()}
                >
                  {saving ? (
                    <Loader2 className="size-4 mr-2 animate-spin" />
                  ) : (
                    <Save className="size-4 mr-2" />
                  )}
                  {t("settings.companyProfile.save")}
                </Button>
              </div>
            ) : null}

            {success ? (
              <p className="text-sm text-emerald-700 dark:text-emerald-400">{success}</p>
            ) : null}
            {error ? <p className="text-sm text-destructive">{error}</p> : null}
          </>
        )}
      </CardContent>
    </SettingsSectionCard>
  );
}
