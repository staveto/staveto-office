"use client";

import { useI18n } from "@/i18n/I18nContext";
import { useWorkspace } from "@/context/WorkspaceContext";
import { isCompanyWorkspaceType } from "@/types/workspace";
import {
  CompanyMembersPanel,
} from "@/components/members/CompanyMembersPanel";
import { PersonalMembersPlaceholder } from "@/components/members/PersonalMembersPlaceholder";

export default function MembersPage() {
  const { t } = useI18n();
  const { activeWorkspace } = useWorkspace();
  const isTeam = isCompanyWorkspaceType(activeWorkspace?.type);

  if (!isTeam) {
    return <PersonalMembersPlaceholder />;
  }

  return (
    <div className="space-y-6">
      <h2 className="text-xl font-semibold">{t("nav.members")}</h2>
      <CompanyMembersPanel />
    </div>
  );
}
