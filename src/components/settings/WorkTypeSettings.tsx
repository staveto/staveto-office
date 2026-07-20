"use client";

import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, Eye, EyeOff, Loader2, Save } from "lucide-react";
import { SettingsSectionCard } from "./SettingsSectionCard";
import {
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { useI18n } from "@/i18n/I18nContext";
import { useEnabledWorkTypes } from "@/context/EnabledWorkTypesContext";
import {
  WORK_TYPES,
  WORK_TYPE_ICONS,
  workTypeHintKey,
  workTypeLabelKey,
  type WorkType,
} from "@/lib/workTypes";
import {
  canDisableWorkType,
  type EnabledWorkTypesMap,
} from "@/lib/enabledWorkTypes";
import { cn } from "@/lib/utils";

function WorkTypeToggle({
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

type Props = {
  className?: string;
};

/**
 * @deprecated Phase 1A — simplified project creation no longer uses job-type
 * toggles. Kept for rollback via NEXT_PUBLIC_ENABLE_LEGACY_PROJECT_TYPE_SETTINGS=1.
 * Remove after migration of historical org.enabledWorkTypes consumers.
 */
export function WorkTypeSettings({ className }: Props) {
  const { t } = useI18n();
  const {
    workTypes,
    loading,
    isCompanyWorkTypesActive,
    canEditWorkTypes,
    updateWorkTypes,
  } = useEnabledWorkTypes();

  const [draft, setDraft] = useState<EnabledWorkTypesMap>(workTypes);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  useEffect(() => {
    setDraft(workTypes);
  }, [workTypes]);

  const { visibleKeys, hiddenKeys } = useMemo(() => {
    const visible: WorkType[] = [];
    const hidden: WorkType[] = [];
    for (const key of WORK_TYPES) {
      if (draft[key]) visible.push(key);
      else hidden.push(key);
    }
    return { visibleKeys: visible, hiddenKeys: hidden };
  }, [draft]);

  const hasChanges = WORK_TYPES.some((key) => draft[key] !== workTypes[key]);

  const toggle = (key: WorkType, enabled: boolean) => {
    if (!enabled && !canDisableWorkType(draft, key)) return;
    setDraft((prev) => ({ ...prev, [key]: enabled }));
    setSuccess(null);
    setError(null);
  };

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    setSuccess(null);
    try {
      await updateWorkTypes(draft);
      setSuccess(t("settings.workTypes.saved"));
    } catch {
      setError(t("settings.workTypes.saveError"));
    } finally {
      setSaving(false);
    }
  };

  if (!isCompanyWorkTypesActive || !canEditWorkTypes) {
    return null;
  }

  return (
    <SettingsSectionCard className={className} id="work-types">
      <CardHeader>
        <CardTitle>{t("settings.workTypes.title")}</CardTitle>
        <CardDescription>{t("settings.workTypes.description")}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {hiddenKeys.length > 0 && !loading ? (
          <div className="flex gap-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950">
            <AlertTriangle className="size-5 shrink-0 text-amber-600" aria-hidden />
            <div>
              <p className="font-medium">{t("settings.workTypes.hiddenBanner.title")}</p>
              <p className="mt-1 text-amber-900/90">
                {t("settings.workTypes.hiddenBanner.description")}
              </p>
            </div>
          </div>
        ) : null}

        {loading ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" aria-hidden />
            {t("settings.workTypes.loading")}
          </div>
        ) : (
          <ul className="divide-y divide-border overflow-hidden rounded-xl border border-border">
            {WORK_TYPES.map((key) => {
              const enabled = draft[key];
              const Icon = WORK_TYPE_ICONS[key];
              const lockOff = enabled && !canDisableWorkType(draft, key);

              return (
                <li
                  key={key}
                  className={cn(
                    "flex items-start justify-between gap-4 px-4 py-4 transition-colors",
                    enabled && "bg-emerald-50/60 dark:bg-emerald-950/10",
                    !enabled && "bg-amber-50/50 dark:bg-amber-950/10"
                  )}
                >
                  <div className="flex min-w-0 flex-1 gap-3">
                    <div
                      className={cn(
                        "mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-lg",
                        enabled && "bg-emerald-100 text-emerald-800",
                        !enabled && "bg-amber-100 text-amber-800"
                      )}
                    >
                      <Icon className="size-4" aria-hidden />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <Label
                          htmlFor={`work-type-${key}`}
                          className={cn(
                            "text-sm font-semibold",
                            !enabled && "text-muted-foreground"
                          )}
                        >
                          {t(workTypeLabelKey(key))}
                        </Label>
                        {enabled ? (
                          <Badge className="gap-1 bg-emerald-600 hover:bg-emerald-600">
                            <Eye className="size-3" aria-hidden />
                            {t("settings.workTypes.statusVisible")}
                          </Badge>
                        ) : (
                          <Badge
                            variant="outline"
                            className="gap-1 border-amber-300 bg-amber-100 text-amber-900"
                          >
                            <EyeOff className="size-3" aria-hidden />
                            {t("settings.workTypes.statusHidden")}
                          </Badge>
                        )}
                      </div>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {t(workTypeHintKey(key))}
                      </p>
                      {lockOff ? (
                        <p className="mt-1 text-xs text-muted-foreground">
                          {t("settings.workTypes.lastEnabledHint")}
                        </p>
                      ) : null}
                    </div>
                  </div>
                  <WorkTypeToggle
                    id={`work-type-${key}`}
                    enabled={enabled}
                    disabled={lockOff || saving}
                    onToggle={() => toggle(key, !enabled)}
                  />
                </li>
              );
            })}
          </ul>
        )}

        <div className="flex flex-wrap items-center justify-between gap-3 text-sm text-muted-foreground">
          <span>
            {t("settings.workTypes.summary", {
              visible: visibleKeys.length,
              hidden: hiddenKeys.length,
            })}
          </span>
        </div>

        {error ? (
          <p className="text-sm text-destructive" role="alert">
            {error}
          </p>
        ) : null}
        {success ? (
          <p className="text-sm text-emerald-700" role="status">
            {success}
          </p>
        ) : null}

        <Button
          type="button"
          disabled={!hasChanges || saving || loading}
          className="bg-[#e06737] hover:bg-[#c95a30] text-white"
          onClick={() => void handleSave()}
        >
          {saving ? (
            <Loader2 className="size-4 mr-2 animate-spin" aria-hidden />
          ) : (
            <Save className="size-4 mr-2" aria-hidden />
          )}
          {t("settings.workTypes.save")}
        </Button>
      </CardContent>
    </SettingsSectionCard>
  );
}
