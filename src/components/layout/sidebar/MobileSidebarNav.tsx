"use client";

import { useSearchParams } from "next/navigation";
import { ExpandedSidebarNav } from "./ExpandedSidebarNav";

type MobileSidebarNavProps = {
  pathname: string;
  isPersonalWorkspace: boolean;
  canManage: boolean;
  comingSoonLabel: string;
  t: (key: string) => string;
  onNavigate?: () => void;
  onLogout?: () => void;
};

export function MobileSidebarNav({
  pathname,
  isPersonalWorkspace,
  canManage,
  comingSoonLabel,
  t,
  onNavigate,
  onLogout,
}: MobileSidebarNavProps) {
  const searchParams = useSearchParams();
  const search = searchParams.toString() ? `?${searchParams.toString()}` : "";

  return (
    <ExpandedSidebarNav
      pathname={pathname}
      search={search}
      isPersonalWorkspace={isPersonalWorkspace}
      canManage={canManage}
      comingSoonLabel={comingSoonLabel}
      t={t}
      onNavigate={onNavigate}
      onLogout={onLogout}
    />
  );
}
