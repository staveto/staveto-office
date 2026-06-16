"use client";

import { Loader2 } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { useI18n } from "@/i18n/I18nContext";
import { cn } from "@/lib/utils";
import type { AppCenterAction, AppCenterStatusBadge } from "@/lib/appCenterTypes";
import { settingsCardClassName } from "@/components/settings/settingsStyles";

const STATUS_BADGE: Record<
  AppCenterStatusBadge,
  { labelKey: string; className: string }
> = {
  enabled: {
    labelKey: "appCenter.status.enabled",
    className: "bg-emerald-600 text-white hover:bg-emerald-600",
  },
  disabled: {
    labelKey: "appCenter.status.disabled",
    className: "border-slate-300 bg-slate-100 text-slate-700",
  },
  connected: {
    labelKey: "appCenter.status.connected",
    className: "bg-emerald-600 text-white hover:bg-emerald-600",
  },
  not_connected: {
    labelKey: "appCenter.status.notConnected",
    className: "border-amber-300 bg-amber-50 text-amber-900",
  },
  coming_soon: {
    labelKey: "appCenter.status.comingSoon",
    className: "border-[#b8c5d4] bg-[#eef2f6] text-[#5a6577]",
  },
  required: {
    labelKey: "appCenter.status.required",
    className: "bg-[#1D376A] text-white hover:bg-[#1D376A]",
  },
};

const ACTION_LABEL: Record<AppCenterAction, string> = {
  enable: "appCenter.action.enable",
  disable: "appCenter.action.disable",
  connect: "appCenter.action.connect",
  manage: "appCenter.action.manage",
  coming_soon: "appCenter.action.comingSoon",
  none: "",
};

const CATEGORY_LABEL: Record<string, string> = {
  core: "appCenter.categories.core",
  communication: "appCenter.categories.communication",
  accounting: "appCenter.categories.accounting",
  maps: "appCenter.categories.maps",
  storage: "appCenter.categories.storage",
  ai: "appCenter.categories.ai",
  workforce: "appCenter.categories.workforce",
  finance: "appCenter.categories.finance",
};

type Props = {
  name: string;
  description: string;
  category: string;
  icon: LucideIcon;
  status: AppCenterStatusBadge;
  statusDetail?: string;
  action: AppCenterAction;
  canEdit: boolean;
  loading?: boolean;
  oauthNote?: boolean;
  onAction?: () => void;
};

export function AppCenterCard({
  name,
  description,
  category,
  icon: Icon,
  status,
  statusDetail,
  action,
  canEdit,
  loading,
  oauthNote,
  onAction,
}: Props) {
  const { t } = useI18n();
  const badge = STATUS_BADGE[status];
  const actionKey = ACTION_LABEL[action];
  const actionDisabled =
    !canEdit ||
    loading ||
    action === "coming_soon" ||
    action === "none";

  return (
    <Card
      className={cn(
        settingsCardClassName,
        "flex h-full flex-col transition-shadow hover:shadow-md"
      )}
    >
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-3">
          <div
            className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-[#1D376A]/10 text-[#1D376A]"
            aria-hidden
          >
            <Icon className="size-5" />
          </div>
          <Badge variant="outline" className={cn("shrink-0 border-0", badge.className)}>
            {t(badge.labelKey)}
          </Badge>
        </div>
        <CardTitle className="text-base text-[#152238]">{name}</CardTitle>
        <CardDescription className="text-[#4a5568]">{description}</CardDescription>
      </CardHeader>
      <CardContent className="flex-1 space-y-2 pb-3">
        <p className="text-xs font-medium uppercase tracking-wide text-[#5a6577]">
          {t(CATEGORY_LABEL[category] ?? category)}
        </p>
        {statusDetail ? (
          <p className="text-xs text-[#5a6577]">{statusDetail}</p>
        ) : null}
        {oauthNote ? (
          <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-950">
            {t("appCenter.apps.gmail.oauthNote")}
          </p>
        ) : null}
      </CardContent>
      {actionKey ? (
        <CardFooter className="border-t border-[#e2e8f0] pt-4">
          <Button
            type="button"
            variant={
              action === "disable" || action === "manage" || action === "coming_soon" || action === "connect"
                ? "outline"
                : "default"
            }
            size="sm"
            disabled={actionDisabled}
            onClick={onAction}
            className={cn(
              action === "enable" ? "bg-[#e06737] hover:bg-[#c9562d]" : undefined,
              action === "connect" ? "border-[#1D376A] text-[#1D376A]" : undefined,
              action === "manage" && status === "connected"
                ? "border-[#1D376A] bg-[#1D376A] text-white hover:bg-[#152a52]"
                : undefined
            )}
          >
            {loading ? <Loader2 className="size-4 animate-spin" data-icon="inline-start" /> : null}
            {t(actionKey)}
          </Button>
        </CardFooter>
      ) : null}
    </Card>
  );
}
