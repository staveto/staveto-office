"use client";

import { useEffect, useState } from "react";
import { Loader2, Lock, Save } from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
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

type Props = {
  className?: string;
};

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

  if (!isCompanyModulesActive) {
    return null;
  }

  if (!canEditModules) {
    return null;
  }

  const isRequired = (key: ModuleKey) =>
    (REQUIRED_MODULES as readonly string[]).includes(key);

  const hasChanges = MODULE_KEYS.some((key) => draft[key] !== modules[key]);

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

  return (
    <Card className={className} id="modules">
      <CardHeader>
        <CardTitle>{t("settings.modules.title")}</CardTitle>
        <CardDescription>{t("settings.modules.description")}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {loading ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" aria-hidden />
            {t("settings.modules.loading")}
          </div>
        ) : (
          <ul className="divide-y divide-border rounded-lg border border-border">
            {MODULE_KEYS.map((key) => {
              const required = isRequired(key);
              const enabled = draft[key];
              return (
                <li
                  key={key}
                  className="flex items-center justify-between gap-4 px-4 py-3"
                >
                  <div className="min-w-0 flex-1">
                    <Label
                      htmlFor={`module-${key}`}
                      className={cn(
                        "text-sm font-medium",
                        required && "text-muted-foreground"
                      )}
                    >
                      {t(MODULE_I18N_KEYS[key])}
                    </Label>
                    {required ? (
                      <p className="mt-0.5 flex items-center gap-1 text-xs text-muted-foreground">
                        <Lock className="size-3 shrink-0" aria-hidden />
                        {t("settings.modules.required")}
                      </p>
                    ) : null}
                  </div>
                  <button
                    id={`module-${key}`}
                    type="button"
                    role="switch"
                    aria-checked={enabled}
                    disabled={required || saving}
                    onClick={() => toggle(key, !enabled)}
                    className={cn(
                      "relative inline-flex h-6 w-11 shrink-0 rounded-full transition-colors",
                      "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1D376A]/40",
                      enabled ? "bg-[#1D376A]" : "bg-muted",
                      required && "cursor-not-allowed opacity-60"
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
                </li>
              );
            })}
          </ul>
        )}

        {error ? <p className="text-sm text-destructive">{error}</p> : null}
        {success ? <p className="text-sm text-emerald-700">{success}</p> : null}

        <Button
          type="button"
          onClick={() => void handleSave()}
          disabled={saving || loading || !hasChanges}
        >
          {saving ? (
            <Loader2 className="size-4 animate-spin" data-icon="inline-start" />
          ) : (
            <Save className="size-4" data-icon="inline-start" />
          )}
          {t("settings.modules.save")}
        </Button>
      </CardContent>
    </Card>
  );
}
