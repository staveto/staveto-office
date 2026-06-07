"use client";

import { useWorkspace } from "@/context/WorkspaceContext";
import { isCompanyWorkspaceType } from "@/types/workspace";
import { CompanyMembersPanel } from "@/components/members/CompanyMembersPanel";
import { PersonalMembersPlaceholder } from "@/components/members/PersonalMembersPlaceholder";
export default function MembersPage() {
  const { activeWorkspace } = useWorkspace();  const isTeam = isCompanyWorkspaceType(activeWorkspace?.type);

  if (!isTeam) {
    return <PersonalMembersPlaceholder />;
  }

  return (
    <div className="space-y-6">
      <CompanyMembersPanel />
    </div>
  );
}
