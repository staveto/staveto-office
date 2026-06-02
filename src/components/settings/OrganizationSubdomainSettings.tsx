"use client";

import { useEffect, useState } from "react";
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
import { Loader2 } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { useWorkspace } from "@/context/WorkspaceContext";
import { useI18n } from "@/i18n/I18nContext";
import { isCompanyWorkspaceType } from "@/types/workspace";
import {
  getOrganizationRecord,
  updateOrganizationSlug,
  isOrganizationSlugAvailable,
} from "@/services/organization/organizationService";
import {
  normalizeWorkspaceSlug,
  validateWorkspaceSlug,
  buildSubdomainPreviewUrl,
} from "@/lib/workspaceSlug";
export function OrganizationSubdomainSettings() {
  const { t } = useI18n();
  const { user } = useAuth();
  const { activeWorkspace, workspaceRole } = useWorkspace();
  const [slug, setSlug] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [availability, setAvailability] = useState<"unknown" | "available" | "taken">(
    "unknown"
  );

  const orgId =
    activeWorkspace && isCompanyWorkspaceType(activeWorkspace.type)
      ? (activeWorkspace.orgId ?? activeWorkspace.id)
      : null;

  const canEdit =
    !!orgId && (workspaceRole === "owner" || workspaceRole === "admin");

  useEffect(() => {
    if (!orgId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    getOrganizationRecord(orgId)
      .then((org) => {
        setSlug(org?.slug ?? "");
      })
      .catch(() => setError(t("settings.subdomain.loadError")))
      .finally(() => setLoading(false));
  }, [orgId, t]);

  useEffect(() => {
    if (!orgId || !slug.trim()) {
      setAvailability("unknown");
      return;
    }
    const validation = validateWorkspaceSlug(slug);
    if (!validation.valid) {
      setAvailability("unknown");
      return;
    }
    const timer = setTimeout(() => {
      isOrganizationSlugAvailable(validation.slug, orgId).then((ok) => {
        setAvailability(ok ? "available" : "taken");
      });
    }, 400);
    return () => clearTimeout(timer);
  }, [slug, orgId]);

  const validation = validateWorkspaceSlug(slug);
  const previewSlug = validation.valid ? validation.slug : normalizeWorkspaceSlug(slug);
  const previewUrl = previewSlug
    ? buildSubdomainPreviewUrl(previewSlug)
    : `https://{slug}.staveto.com`;

  async function handleSave() {
    if (!orgId || !user?.id || !validation.valid) return;
    setSaving(true);
    setError(null);
    setSuccess(null);
    try {
      const result = await updateOrganizationSlug(orgId, validation.slug, user.id);
      setSlug(result.slug);
      setSuccess(t("settings.subdomain.saved"));
    } catch (e) {
      setError(e instanceof Error ? e.message : t("settings.subdomain.saveError"));
    } finally {
      setSaving(false);
    }
  }

  if (!orgId) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>{t("settings.subdomain.title")}</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            {t("settings.subdomain.teamOnly")}
          </p>
        </CardContent>
      </Card>
    );
  }

  if (!canEdit) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>{t("settings.subdomain.title")}</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            {t("settings.subdomain.adminOnly")}
          </p>
          {slug ? (
            <p className="mt-2 text-sm">
              {t("settings.subdomain.current")}:{" "}
              <a href={buildSubdomainPreviewUrl(slug)} className="text-primary underline">
                {buildSubdomainPreviewUrl(slug)}
              </a>
            </p>
          ) : null}
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("settings.subdomain.title")}</CardTitle>
        <CardDescription>{t("settings.subdomain.description")}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {loading ? (
          <Loader2 className="size-6 animate-spin text-muted-foreground" />
        ) : (
          <>
            <div className="space-y-2">
              <Label htmlFor="org-slug">{t("settings.subdomain.slugLabel")}</Label>
              <Input
                id="org-slug"
                value={slug}
                onChange={(e) => setSlug(e.target.value)}
                placeholder="elc"
                autoComplete="off"
              />
              {!validation.valid && slug.trim() ? (
                <p className="text-sm text-destructive">{validation.error}</p>
              ) : null}
              {validation.valid && availability === "taken" ? (
                <p className="text-sm text-destructive">
                  {t("settings.subdomain.taken")}
                </p>
              ) : null}
              {validation.valid && availability === "available" ? (
                <p className="text-sm text-muted-foreground">
                  {t("settings.subdomain.available")}
                </p>
              ) : null}
            </div>
            <div className="rounded-lg border bg-muted/40 px-3 py-2 text-sm">
              <span className="text-muted-foreground">{t("settings.subdomain.preview")}: </span>
              <span className="font-medium">{previewUrl}</span>
            </div>
            <p className="text-xs text-muted-foreground">{t("settings.subdomain.dnsNote")}</p>
            {error ? <p className="text-sm text-destructive">{error}</p> : null}
            {success ? <p className="text-sm text-green-700">{success}</p> : null}
            <Button
              type="button"
              onClick={handleSave}
              disabled={
                saving ||
                !validation.valid ||
                availability === "taken"
              }
            >
              {saving ? <Loader2 className="size-4 animate-spin" /> : t("settings.subdomain.save")}
            </Button>
          </>
        )}
      </CardContent>
    </Card>
  );
}
