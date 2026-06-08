"use client";

import { useSearchParams } from "next/navigation";
import { ExpandedSidebarNav } from "./ExpandedSidebarNav";

type MobileSidebarNavProps = {
  pathname: string;
  isPersonalWorkspace: boolean;
  canManage: boolean;
  isFieldWorker?: boolean;
  enabledModules?: import("@/lib/enabledModules").EnabledModulesMap | null;
  comingSoonLabel: string;
  t: (key: string) => string;
  onNavigate?: () => void;
  onLogout?: () => void;
};

export function MobileSidebarNav({
  pathname,
  isPersonalWorkspace,
  canManage,
  isFieldWorker = false,
  enabledModules = null,
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
      isFieldWorker={isFieldWorker}
      enabledModules={enabledModules}
      comingSoonLabel={comingSoonLabel}
      t={t}
      onNavigate={onNavigate}
      onLogout={onLogout}
    />
  );
}
