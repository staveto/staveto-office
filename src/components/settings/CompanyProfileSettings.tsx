"use client";

import { useEffect, useRef, useState } from "react";
import { Building2, ImagePlus, Loader2, Save, Trash2 } from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
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
import { mapCompanyLogoError } from "@/lib/companyProfileErrors";

const emptyProfile = (): OrganizationProfile => ({});

export function CompanyProfileSettings() {
  const { t } = useI18n();
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
        setProfile(loaded);
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
    setSaving(true);
    setError(null);
    setSuccess(null);
    try {
      await saveCompanyProfile(orgId, user.id, profile);
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

  if (!orgId) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Building2 className="size-4 text-[#1D376A]" aria-hidden />
            {t("settings.companyProfile.title")}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">{t("settings.companyProfile.teamOnly")}</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Building2 className="size-4 text-[#1D376A]" aria-hidden />
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
              <p className="text-sm text-amber-800 bg-amber-50 border border-amber-200 rounded-md px-3 py-2">
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
              <div className="space-y-2">
                <Label htmlFor="cp-country">{t("settings.companyProfile.country")}</Label>
                <Input
                  id="cp-country"
                  value={profile.country ?? ""}
                  disabled={!canEdit}
                  onChange={(e) => patch("country", e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="cp-reg">{t("settings.companyProfile.registrationNumber")}</Label>
                <Input
                  id="cp-reg"
                  value={profile.registrationNumber ?? ""}
                  disabled={!canEdit}
                  onChange={(e) => patch("registrationNumber", e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="cp-tax">{t("settings.companyProfile.taxId")}</Label>
                <Input
                  id="cp-tax"
                  value={profile.taxId ?? ""}
                  disabled={!canEdit}
                  onChange={(e) => patch("taxId", e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="cp-vat">{t("settings.companyProfile.vatId")}</Label>
                <Input
                  id="cp-vat"
                  value={profile.vatId ?? ""}
                  disabled={!canEdit}
                  onChange={(e) => patch("vatId", e.target.value)}
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

            {success ? <p className="text-sm text-emerald-700">{success}</p> : null}
            {error ? <p className="text-sm text-destructive">{error}</p> : null}
          </>
        )}
      </CardContent>
    </Card>
  );
}
