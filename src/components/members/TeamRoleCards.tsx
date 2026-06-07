"use client";

import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { useI18n } from "@/i18n/I18nContext";
import { RolePermissionPreview } from "@/components/members/RolePermissionPreview";
import type { PermissionPreviewRole } from "@/lib/rolePermissions";

const ROLE_CARD_IDS = [
  "owner",
  "admin",
  "manager",
  "worker",
  "partner",
  "customer",
] as const;

type RoleCardId = (typeof ROLE_CARD_IDS)[number];

function isComingSoonRole(id: RoleCardId): boolean {
  return id === "partner" || id === "customer";
}

export function TeamRoleCards() {
  const { t } = useI18n();

  return (
    <section className="space-y-4">
      <h2 className="text-base font-semibold tracking-tight text-foreground">
        {t("members.rolesSection.title")}
      </h2>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {ROLE_CARD_IDS.map((id) => {
          const comingSoon = isComingSoonRole(id);
          return (
            <div
              key={id}
              className={cn(
                "rounded-xl px-4 py-4 ring-1",
                comingSoon
                  ? "bg-muted/20 ring-border/40 opacity-80"
                  : "bg-background ring-border/60"
              )}
            >
              <div className="flex items-center justify-between gap-2">
                <h3 className="text-sm font-semibold text-[#1D376A]">
                  {t(`members.rolesSection.${id}.title`)}
                </h3>
                {comingSoon ? (
                  <Badge variant="secondary" className="text-[10px] font-normal">
                    {t("members.rolesSection.comingSoon")}
                  </Badge>
                ) : null}
              </div>
              <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
                {t(`members.rolesSection.${id}.description`)}
              </p>
              <div className="mt-3 border-t border-border/40 pt-3">
                <RolePermissionPreview role={id as PermissionPreviewRole} />
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
