"use client";

import { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  Eye,
  EyeOff,
  Loader2,
  Lock,
  Save,
  Wallet,
  Wrench,
  Car,
  FileText,
  CalendarDays,
  Users,
  Briefcase,
  Receipt,
  BarChart3,
  MessageSquareWarning,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { useI18n } from "@/i18n/I18nContext";
import { useEnabledModules } from "@/context/EnabledModulesContext";
import {
  MODULE_KEYS,
  REQUIRED_MODULES,
  type EnabledModulesMap,
  type ModuleKey,
} from "@/lib/enabledModules";
import { cn } from "@/lib/utils";

const MODULE_I18N_KEYS: Record<ModuleKey, string> = {
  jobs: "settings.modules.jobs",
  quotes: "settings.modules.quotes",
  team: "settings.modules.team",
  documents: "settings.modules.documents",
  planning: "settings.modules.planning",
  vehicles: "settings.modules.vehicles",
  equipment: "settings.modules.equipment",
  expenses: "settings.modules.expenses",
  billing: "settings.modules.billing",
  reports: "settings.modules.reports",
  issues: "settings.modules.issues",
};

const MODULE_ICONS: Record<ModuleKey, LucideIcon> = {
  jobs: Briefcase,
  quotes: Receipt,
  team: Users,
  documents: FileText,
  planning: CalendarDays,
  vehicles: Car,
  equipment: Wrench,
  expenses: Wallet,
  billing: Receipt,
  reports: BarChart3,
  issues: MessageSquareWarning,
};

const MODULE_SIDEBAR_HINTS: Partial<Record<ModuleKey, string>> = {
  expenses: "settings.modules.hint.expenses",
  equipment: "settings.modules.hint.equipment",
  quotes: "settings.modules.hint.quotes",
  planning: "settings.modules.hint.planning",
  vehicles: "settings.modules.hint.vehicles",
  reports: "settings.modules.hint.reports",
  documents: "settings.modules.hint.documents",
  issues: "settings.modules.hint.issues",
};

type Props = {
  className?: string;
};

function ModuleToggle({
  enabled,
  disabled,
  onToggle,
  id,
}: {
  enabled: boolean;
  disabled?: boolean;
  onToggle: () => void;
  id: string;
}) {
  return (
    <button
      id={id}
      type="button"
      role="switch"
      aria-checked={enabled}
      disabled={disabled}
      onClick={onToggle}
      className={cn(
        "relative inline-flex h-7 w-12 shrink-0 rounded-full border-2 transition-colors",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1D376A]/40",
        enabled
          ? "border-emerald-600 bg-emerald-600"
          : "border-muted-foreground/30 bg-muted",
        disabled && "cursor-not-allowed opacity-60"
      )}
    >
      <span
        className={cn(
          "pointer-events-none inline-block size-5 translate-y-0.5 rounded-full bg-white shadow transition-transform",
          enabled ? "translate-x-[1.375rem]" : "translate-x-0.5"
        )}
        aria-hidden
      />
    </button>
  );
}

function ModuleRow({
  moduleKey,
  enabled,
  required,
  saving,
  onToggle,
  t,
}: {
  moduleKey: ModuleKey;
  enabled: boolean;
  required: boolean;
  saving: boolean;
  onToggle: () => void;
  t: (key: string) => string;
}) {
  const Icon = MODULE_ICONS[moduleKey];
  const hintKey = MODULE_SIDEBAR_HINTS[moduleKey];

  return (
    <li
      className={cn(
        "flex items-start justify-between gap-4 px-4 py-4 transition-colors",
        required && "bg-muted/30",
        !required && enabled && "bg-emerald-50/60 dark:bg-emerald-950/10",
        !required && !enabled && "bg-amber-50/50 dark:bg-amber-950/10"
      )}
    >
      <div className="flex min-w-0 flex-1 gap-3">
        <div
          className={cn(
            "mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-lg",
            required && "bg-muted text-muted-foreground",
            !required && enabled && "bg-emerald-100 text-emerald-800",
            !required && !enabled && "bg-amber-100 text-amber-800"
          )}
        >
          <Icon className="size-4" aria-hidden />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <Label
              htmlFor={`module-${moduleKey}`}
              className={cn("text-sm font-semibold", !enabled && !required && "text-muted-foreground")}
            >
              {t(MODULE_I18N_KEYS[moduleKey])}
            </Label>
            {required ? (
              <Badge variant="secondary" className="gap-1">
                <Lock className="size-3" aria-hidden />
                {t("settings.modules.statusRequired")}
              </Badge>
            ) : enabled ? (
              <Badge className="gap-1 bg-emerald-600 hover:bg-emerald-600">
                <Eye className="size-3" aria-hidden />
                {t("settings.modules.statusVisible")}
              </Badge>
            ) : (
              <Badge variant="outline" className="gap-1 border-amber-300 bg-amber-100 text-amber-900">
                <EyeOff className="size-3" aria-hidden />
                {t("settings.modules.statusHidden")}
              </Badge>
            )}
          </div>
          {required ? (
            <p className="mt-1 text-xs text-muted-foreground">{t("settings.modules.requiredHint")}</p>
          ) : hintKey ? (
            <p className="mt-1 text-xs text-muted-foreground">
              {enabled ? t("settings.modules.sidebarVisible") : t("settings.modules.sidebarHidden")}{" "}
              <span className="font-medium text-foreground/80">{t(hintKey)}</span>
            </p>
          ) : enabled ? (
            <p className="mt-1 text-xs text-muted-foreground">{t("settings.modules.sidebarVisibleGeneric")}</p>
          ) : (
            <p className="mt-1 text-xs text-muted-foreground">{t("settings.modules.sidebarHiddenGeneric")}</p>
          )}
        </div>
      </div>
      <ModuleToggle
        id={`module-${moduleKey}`}
        enabled={enabled}
        disabled={required || saving}
        onToggle={onToggle}
      />
    </li>
  );
}

export function ModuleSettings({ className }: Props) {
  const { t } = useI18n();
  const { modules, loading, isCompanyModulesActive, canEditModules, updateModules } =
    useEnabledModules();

  const [draft, setDraft] = useState<EnabledModulesMap>(modules);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  useEffect(() => {
    setDraft(modules);
  }, [modules]);

  const isRequired = (key: ModuleKey) => (REQUIRED_MODULES as readonly string[]).includes(key);

  const { requiredKeys, visibleKeys, hiddenKeys } = useMemo(() => {
    const required: ModuleKey[] = [];
    const visible: ModuleKey[] = [];
    const hidden: ModuleKey[] = [];
    for (const key of MODULE_KEYS) {
      if (isRequired(key)) required.push(key);
      else if (draft[key]) visible.push(key);
      else hidden.push(key);
    }
    return { requiredKeys: required, visibleKeys: visible, hiddenKeys: hidden };
  }, [draft]);

  const hasChanges = MODULE_KEYS.some((key) => draft[key] !== modules[key]);
  const hiddenCount = hiddenKeys.length;
  const showHiddenBanner = hiddenCount > 0;

  const toggle = (key: ModuleKey, enabled: boolean) => {
    if (isRequired(key)) return;
    setDraft((prev) => ({ ...prev, [key]: enabled }));
    setSuccess(null);
    setError(null);
  };

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    setSuccess(null);
    try {
      await updateModules(draft);
      setSuccess(t("settings.modules.saved"));
    } catch {
      setError(t("settings.modules.saveError"));
    } finally {
      setSaving(false);
    }
  };

  if (!isCompanyModulesActive || !canEditModules) {
    return null;
  }

  return (
    <Card className={className} id="modules">
      <CardHeader>
        <CardTitle>{t("settings.modules.title")}</CardTitle>
        <CardDescription>{t("settings.modules.description")}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {!loading && (
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="rounded-lg border border-border bg-muted/20 px-4 py-3">
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                {t("settings.modules.summaryRequired")}
              </p>
              <p className="mt-1 text-2xl font-semibold tabular-nums">{requiredKeys.length}</p>
            </div>
            <div className="rounded-lg border border-emerald-200 bg-emerald-50/80 px-4 py-3">
              <p className="text-xs font-medium uppercase tracking-wide text-emerald-800">
                {t("settings.modules.summaryVisible")}
              </p>
              <p className="mt-1 text-2xl font-semibold tabular-nums text-emerald-900">
                {visibleKeys.length}
              </p>
            </div>
            <div className="rounded-lg border border-amber-200 bg-amber-50/80 px-4 py-3">
              <p className="text-xs font-medium uppercase tracking-wide text-amber-800">
                {t("settings.modules.summaryHidden")}
              </p>
              <p className="mt-1 text-2xl font-semibold tabular-nums text-amber-900">
                {hiddenKeys.length}
              </p>
            </div>
          </div>
        )}

        {showHiddenBanner && !loading && (
          <div className="flex gap-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950">
            <AlertTriangle className="size-5 shrink-0 text-amber-600" aria-hidden />
            <div>
              <p className="font-medium">{t("settings.modules.hiddenBanner.title")}</p>
              <p className="mt-1 text-amber-900/90">{t("settings.modules.hiddenBanner.description")}</p>
            </div>
          </div>
        )}

        {loading ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" aria-hidden />
            {t("settings.modules.loading")}
          </div>
        ) : (
          <div className="space-y-6">
            <section>
              <h3 className="mb-2 text-sm font-semibold text-foreground">
                {t("settings.modules.sectionRequired")}
              </h3>
              <ul className="divide-y divide-border overflow-hidden rounded-xl border border-border">
                {requiredKeys.map((key) => (
                  <ModuleRow
                    key={key}
                    moduleKey={key}
                    enabled
                    required
                    saving={saving}
                    onToggle={() => toggle(key, !draft[key])}
                    t={t}
                  />
                ))}
              </ul>
            </section>

            <section>
              <h3 className="mb-2 flex items-center gap-2 text-sm font-semibold text-emerald-800">
                <Eye className="size-4" aria-hidden />
                {t("settings.modules.sectionVisible")}
                <Badge className="bg-emerald-600 hover:bg-emerald-600">{visibleKeys.length}</Badge>
              </h3>
              {visibleKeys.length === 0 ? (
                <p className="rounded-xl border border-dashed border-border px-4 py-6 text-center text-sm text-muted-foreground">
                  {t("settings.modules.sectionVisibleEmpty")}
                </p>
              ) : (
                <ul className="divide-y divide-border overflow-hidden rounded-xl border border-emerald-200">
                  {visibleKeys.map((key) => (
                    <ModuleRow
                      key={key}
                      moduleKey={key}
                      enabled
                      required={false}
                      saving={saving}
                      onToggle={() => toggle(key, false)}
                      t={t}
                    />
                  ))}
                </ul>
              )}
            </section>

            <section>
              <h3 className="mb-2 flex items-center gap-2 text-sm font-semibold text-amber-800">
                <EyeOff className="size-4" aria-hidden />
                {t("settings.modules.sectionHidden")}
                <Badge variant="outline" className="border-amber-300 bg-amber-100 text-amber-900">
                  {hiddenKeys.length}
                </Badge>
              </h3>
              {hiddenKeys.length === 0 ? (
                <p className="rounded-xl border border-dashed border-emerald-200 bg-emerald-50/40 px-4 py-6 text-center text-sm text-emerald-800">
                  {t("settings.modules.sectionHiddenEmpty")}
                </p>
              ) : (
                <ul className="divide-y divide-border overflow-hidden rounded-xl border border-amber-200">
                  {hiddenKeys.map((key) => (
                    <ModuleRow
                      key={key}
                      moduleKey={key}
                      enabled={false}
                      required={false}
                      saving={saving}
                      onToggle={() => toggle(key, true)}
                      t={t}
                    />
                  ))}
                </ul>
              )}
            </section>
          </div>
        )}

        {error ? <p className="text-sm text-destructive">{error}</p> : null}
        {success ? (
          <p className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
            {success}
          </p>
        ) : null}

        <div
          className={cn(
            "sticky bottom-0 -mx-1 flex flex-col gap-2 rounded-lg border bg-background/95 p-4 backdrop-blur sm:flex-row sm:items-center sm:justify-between",
            hasChanges ? "border-[#1D376A]/30 shadow-sm" : "border-transparent"
          )}
        >
          <p className="text-sm text-muted-foreground">
            {hasChanges ? t("settings.modules.unsavedHint") : t("settings.modules.savedHint")}
          </p>
          <Button
            type="button"
            onClick={() => void handleSave()}
            disabled={saving || loading || !hasChanges}
            className="shrink-0"
          >
            {saving ? (
              <Loader2 className="size-4 animate-spin" data-icon="inline-start" />
            ) : (
              <Save className="size-4" data-icon="inline-start" />
            )}
            {t("settings.modules.save")}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
