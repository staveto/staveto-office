"use client";

import { usePathname } from "next/navigation";
import { AppLayout } from "./AppLayout";
import { WorkspaceProvider } from "@/context/WorkspaceContext";
import { EnabledModulesProvider } from "@/context/EnabledModulesContext";

export function ConditionalAppLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isPrintRoute = pathname?.includes("/print");

  if (pathname === "/onboarding") {
    return <>{children}</>;
  }

  if (isPrintRoute) {
    return (
      <WorkspaceProvider>
        <EnabledModulesProvider>{children}</EnabledModulesProvider>
      </WorkspaceProvider>
    );
  }

  return (
    <WorkspaceProvider>
      <EnabledModulesProvider>
        <AppLayout>{children}</AppLayout>
      </EnabledModulesProvider>
    </WorkspaceProvider>
  );
}
