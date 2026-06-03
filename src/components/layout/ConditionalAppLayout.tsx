"use client";

import { usePathname } from "next/navigation";
import { AppLayout } from "./AppLayout";
import { WorkspaceProvider } from "@/context/WorkspaceContext";

export function ConditionalAppLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isPrintRoute = pathname?.includes("/print");

  if (pathname === "/onboarding") {
    return <>{children}</>;
  }

  if (isPrintRoute) {
    return <WorkspaceProvider>{children}</WorkspaceProvider>;
  }

  return (
    <WorkspaceProvider>
      <AppLayout>{children}</AppLayout>
    </WorkspaceProvider>
  );
}
