"use client";

import { usePathname } from "next/navigation";
import { AppLayout } from "./AppLayout";
import { WorkspaceProvider } from "@/context/WorkspaceContext";
import { EnabledModulesProvider } from "@/context/EnabledModulesContext";
import { EnabledWorkTypesProvider } from "@/context/EnabledWorkTypesContext";

export function ConditionalAppLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isPrintRoute = pathname?.includes("/print");

  if (pathname === "/onboarding") {
    return <>{children}</>;
  }

  if (isPrintRoute) {
    return (
      <WorkspaceProvider>
        <EnabledModulesProvider>
          <EnabledWorkTypesProvider>{children}</EnabledWorkTypesProvider>
        </EnabledModulesProvider>
      </WorkspaceProvider>
    );
  }

  return (
    <WorkspaceProvider>
      <EnabledModulesProvider>
        <EnabledWorkTypesProvider>
          <AppLayout>{children}</AppLayout>
        </EnabledWorkTypesProvider>
      </EnabledModulesProvider>
    </WorkspaceProvider>
  );
}
