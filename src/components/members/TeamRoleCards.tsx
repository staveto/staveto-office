"use client";

import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
  const [selectedRole, setSelectedRole] = useState<RoleCardId>("worker");
  const comingSoon = isComingSoonRole(selectedRole);

  return (
    <section className="space-y-3">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h2 className="text-base font-semibold tracking-tight text-foreground">
          {t("members.rolesSection.title")}
        </h2>
        <Select
          value={selectedRole}
          onValueChange={(value) => setSelectedRole(value as RoleCardId)}
        >
          <SelectTrigger className="w-full sm:w-[220px]" aria-label={t("members.rolesSection.selectRole")}>
            <SelectValue placeholder={t("members.rolesSection.selectRole")} />
          </SelectTrigger>
          <SelectContent>
            {ROLE_CARD_IDS.map((id) => (
              <SelectItem key={id} value={id}>
                {t(`members.rolesSection.${id}.title`)}
                {isComingSoonRole(id) ? ` (${t("members.rolesSection.comingSoon")})` : ""}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div
        className={cn(
          "rounded-xl px-4 py-4 ring-1 max-w-xl",
          comingSoon ? "bg-muted/20 ring-border/40 opacity-90" : "bg-background ring-border/60"
        )}
      >
        <div className="flex items-center justify-between gap-2">
          <h3 className="text-sm font-semibold text-[#1D376A]">
            {t(`members.rolesSection.${selectedRole}.title`)}
          </h3>
          {comingSoon ? (
            <Badge variant="secondary" className="text-[10px] font-normal">
              {t("members.rolesSection.comingSoon")}
            </Badge>
          ) : null}
        </div>
        <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
          {t(`members.rolesSection.${selectedRole}.description`)}
        </p>
        <div className="mt-3 border-t border-border/40 pt-3">
          <RolePermissionPreview role={selectedRole as PermissionPreviewRole} />
        </div>
      </div>
    </section>
  );
}
