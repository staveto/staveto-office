"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Loader2, Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { useI18n } from "@/i18n/I18nContext";
import { useEnabledModules } from "@/context/EnabledModulesContext";
import { useWorkspace } from "@/context/WorkspaceContext";
import {
  APP_CENTER_CATALOG,
  filterCatalogByCategory,
  filterCatalogBySearch,
  parseAppCenterCategory,
  type AppCenterCategory,
} from "@/lib/appCenterCatalog";
import { resolveAppCardState } from "@/lib/appCenterStatus";
import type { EnabledModulesMap } from "@/lib/enabledModules";
import {
  loadAppCenterSettings,
  probeServerFeatures,
  toggleAppCenterModule,
  type ServerFeatureProbe,
} from "@/services/organizations/appCenterSettings";
import type { OrganizationIntegrations } from "@/lib/appCenterTypes";
import { AppCenterCard } from "@/components/settings/AppCenterCard";
import { AppCenterCategoryNav } from "@/components/settings/AppCenterCategoryNav";
import { settingsInputClassName } from "@/components/settings/settingsStyles";

type Props = {
  canEdit: boolean;
};

export function AppCenterPage({ canEdit }: Props) {
  const { t } = useI18n();
  const searchParams = useSearchParams();
  const { activeWorkspace } = useWorkspace();
  const { refreshModules } = useEnabledModules();

  const orgId =
    activeWorkspace?.type === "company"
      ? activeWorkspace.orgId ?? activeWorkspace.id
      : undefined;

  const [category, setCategory] = useState<AppCenterCategory>(() =>
    parseAppCenterCategory(searchParams.get("category"))
  );
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [modules, setModules] = useState<EnabledModulesMap | null>(null);
  const [integrations, setIntegrations] = useState<OrganizationIntegrations>({});
  const [probe, setProbe] = useState<ServerFeatureProbe>({
    googleMapsConfigured: false,
    aiInvoiceOcrAvailable: true,
  });
  const [planCode, setPlanCode] = useState<string | undefined>();
  const [orgStatus, setOrgStatus] = useState<string | undefined>();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const cat = parseAppCenterCategory(searchParams.get("category"));
    setCategory(cat);
  }, [searchParams]);

  const refresh = useCallback(async () => {
    if (!orgId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const [settings, featureProbe] = await Promise.all([
        loadAppCenterSettings(orgId),
        probeServerFeatures(),
      ]);
      setModules(settings.enabledModules);
      setIntegrations(settings.integrations);
      setPlanCode(settings.planCode);
      setOrgStatus(settings.status);
      setProbe(featureProbe);
    } catch {
      setError(t("appCenter.error.load"));
    } finally {
      setLoading(false);
    }
  }, [orgId, t]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const filteredItems = useMemo(() => {
    const byCat = filterCatalogByCategory(APP_CENTER_CATALOG, category);
    return filterCatalogBySearch(byCat, search, t);
  }, [category, search, t]);

  const categoryCounts = useMemo(() => {
    const counts: Partial<Record<AppCenterCategory, number>> = { all: APP_CENTER_CATALOG.length };
    for (const item of APP_CENTER_CATALOG) {
      counts[item.category] = (counts[item.category] ?? 0) + 1;
    }
    return counts;
  }, []);

  const handleModuleToggle = async (itemId: string, moduleKey: keyof EnabledModulesMap, enable: boolean) => {
    if (!orgId || !canEdit) return;
    setBusyId(itemId);
    setError(null);
    try {
      const next = await toggleAppCenterModule(orgId, moduleKey, enable);
      setModules(next);
      await refreshModules();
    } catch {
      setError(t("appCenter.error.save"));
    } finally {
      setBusyId(null);
    }
  };

  if (!orgId) {
    return (
      <p className="text-sm text-muted-foreground">{t("appCenter.error.noCompany")}</p>
    );
  }

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-bold tracking-tight text-[#152238]">
          {t("appCenter.title")}
        </h1>
        <p className="mt-1 max-w-2xl text-sm leading-relaxed text-[#4a5568]">
          {t("appCenter.subtitle")}
        </p>
        {(planCode || orgStatus) && (
          <p className="mt-2 text-xs text-[#5a6577]">
            {planCode ? t("appCenter.planLabel", { plan: planCode }) : null}
            {planCode && orgStatus ? " · " : null}
            {orgStatus ? t("appCenter.statusLabel", { status: orgStatus }) : null}
          </p>
        )}
      </header>

      {!canEdit ? (
        <div className="rounded-lg border border-[#b8c5d4] bg-[#f8fafc] px-4 py-3 text-sm text-[#4a5568]">
          {t("appCenter.readOnly")}
        </div>
      ) : null}

      <div className="relative max-w-md">
        <Search
          className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-[#5a6577]"
          aria-hidden
        />
        <Input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={t("appCenter.searchPlaceholder")}
          className={`pl-9 ${settingsInputClassName}`}
          aria-label={t("appCenter.searchPlaceholder")}
        />
      </div>

      <div className="md:hidden">
        <AppCenterCategoryNav
          active={category}
          onChange={setCategory}
          counts={categoryCounts}
          layout="tabs"
        />
      </div>

      <div className="flex flex-col gap-6 lg:flex-row lg:items-start">
        <div className="hidden w-52 shrink-0 lg:block">
          <AppCenterCategoryNav
            active={category}
            onChange={setCategory}
            counts={categoryCounts}
            layout="sidebar"
            className="rounded-xl border border-[#b8c5d4] bg-white p-2 shadow-sm"
          />
        </div>

        <div className="min-w-0 flex-1">
          {loading ? (
            <div className="flex items-center gap-2 py-12 text-sm text-[#5a6577]">
              <Loader2 className="size-4 animate-spin" aria-hidden />
              {t("appCenter.loading")}
            </div>
          ) : filteredItems.length === 0 ? (
            <div className="rounded-xl border border-dashed border-[#b8c5d4] bg-white px-6 py-12 text-center">
              <p className="text-sm font-medium text-[#152238]">{t("appCenter.empty.title")}</p>
              <p className="mt-1 text-sm text-[#5a6577]">{t("appCenter.empty.description")}</p>
            </div>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {filteredItems.map((item) => {
                if (!modules) return null;
                const resolved = resolveAppCardState(item, {
                  modules,
                  integrations,
                  probe,
                });
                const statusDetail = resolved.statusDetailKey
                  ? t(resolved.statusDetailKey)
                  : undefined;

                return (
                  <AppCenterCard
                    key={item.id}
                    name={t(item.nameKey)}
                    description={t(item.descriptionKey)}
                    category={item.category}
                    icon={item.icon}
                    status={resolved.status}
                    statusDetail={statusDetail}
                    action={resolved.action}
                    canEdit={canEdit}
                    loading={busyId === item.id}
                    oauthNote={item.oauthNote}
                    onAction={() => {
                      if (item.moduleKey && (resolved.action === "enable" || resolved.action === "disable")) {
                        void handleModuleToggle(
                          item.id,
                          item.moduleKey,
                          resolved.action === "enable"
                        );
                      }
                    }}
                  />
                );
              })}
            </div>
          )}
        </div>
      </div>

      {error ? <p className="text-sm text-destructive">{error}</p> : null}
    </div>
  );
}
