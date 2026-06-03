"use client";

import { useMemo } from "react";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useI18n } from "@/i18n/I18nContext";
import {
  getCompanyRoleLabelKey,
  getMemberStatusLabelKey,
  isWebEditableStoredRole,
  type CanonicalCompanyRole,
  type CompanyTeamMemberRow,
} from "@/lib/companyRoles";
import type { OrgMemberRole } from "@/lib/organizations";

type MemberRoleCellProps = {
  row: CompanyTeamMemberRow;
  canManage: boolean;
  actioning: boolean;
  onChangeRole?: (uid: string, role: OrgMemberRole) => void;
};

export function MemberRoleCell({
  row,
  canManage,
  actioning,
  onChangeRole,
}: MemberRoleCellProps) {
  const { t } = useI18n();
  const labelKey = getCompanyRoleLabelKey(row.effectiveRole);

  const editable =
    canManage &&
    row.effectiveRole !== "owner" &&
    isWebEditableStoredRole(row.storedRole) &&
    !!onChangeRole;

  if (editable && row.storedRole) {
    return (
      <Select
        value={row.storedRole as OrgMemberRole}
        onValueChange={(v) => onChangeRole!(row.uid, v as OrgMemberRole)}
        disabled={actioning}
      >
        <SelectTrigger className="h-8 w-[11rem]">
          <SelectValue>{t(labelKey)}</SelectValue>
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="admin">{t("members.role.admin")}</SelectItem>
          <SelectItem value="member">{t("members.role.viewer")}</SelectItem>
        </SelectContent>
      </Select>
    );
  }

  return (
    <Badge
      variant={row.effectiveRole === "owner" ? "default" : "secondary"}
      className="font-normal"
    >
      {t(labelKey)}
    </Badge>
  );
}

type MemberStatusCellProps = {
  status: string;
};

export function MemberStatusCell({ status }: MemberStatusCellProps) {
  const { t } = useI18n();
  const key = getMemberStatusLabelKey(status);
  const isActive = String(status ?? "active").toLowerCase() === "active";

  return (
    <Badge variant={isActive ? "default" : "secondary"} className="font-normal">
      {t(key)}
    </Badge>
  );
}

export function useCurrentUserCompanyRole(
  ownerUid: string | undefined,
  currentUserId: string | undefined,
  members: CompanyTeamMemberRow[]
): CanonicalCompanyRole | null {
  return useMemo(() => {
    if (!currentUserId) return null;
    if (ownerUid === currentUserId) return "owner";
    const self = members.find((m) => (m.userId ?? m.uid) === currentUserId);
    return self?.effectiveRole ?? null;
  }, [ownerUid, currentUserId, members]);
}
