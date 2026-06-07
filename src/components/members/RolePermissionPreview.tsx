"use client";

import { Check, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { useI18n } from "@/i18n/I18nContext";
import {
  getPermissionModuleLabelKey,
  PERMISSION_PREVIEW_MODULES,
  ROLE_PERMISSION_MATRIX,
  type PermissionPreviewRole,
} from "@/lib/rolePermissions";

type RolePermissionPreviewProps = {
  role: PermissionPreviewRole;
  /** Tighter spacing for dialogs. */
  compact?: boolean;
  className?: string;
};

export function RolePermissionPreview({
  role,
  compact = false,
  className,
}: RolePermissionPreviewProps) {
  const { t } = useI18n();
  const permissions = ROLE_PERMISSION_MATRIX[role];

  return (
    <div className={cn(compact ? "space-y-1" : "space-y-1.5", className)}>
      <p
        className={cn(
          "font-medium uppercase tracking-wide text-muted-foreground",
          compact ? "text-[10px]" : "text-[10px]"
        )}
      >
        {t("members.permissionPreview.title")}
      </p>
      <ul
        className={cn(
          "grid grid-cols-2 gap-x-3 gap-y-1",
          compact ? "sm:grid-cols-2" : "sm:grid-cols-2"
        )}
        role="list"
        aria-label={t("members.permissionPreview.title")}
      >
        {PERMISSION_PREVIEW_MODULES.map((moduleKey) => {
          const allowed = permissions[moduleKey];
          const label = t(getPermissionModuleLabelKey(role, moduleKey));
          return (
            <li
              key={moduleKey}
              className={cn(
                "flex items-center gap-1.5 min-w-0 text-xs",
                !allowed && "text-muted-foreground/70"
              )}
            >
              {allowed ? (
                <Check
                  className="size-3.5 shrink-0 text-emerald-600"
                  aria-hidden
                />
              ) : (
                <X
                  className="size-3.5 shrink-0 text-muted-foreground/45"
                  aria-hidden
                />
              )}
              <span className="truncate" title={label}>
                {label}
              </span>
              <span className="sr-only">
                {allowed
                  ? t("members.permissionPreview.allowed")
                  : t("members.permissionPreview.notAllowed")}
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
