"use client";

import { usePathname } from "next/navigation";
import { AppLayout } from "./AppLayout";
import { WorkspaceProvider } from "@/context/WorkspaceContext";

export function ConditionalAppLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  if (pathname === "/onboarding") {
    return <>{children}</>;
  }
  return (
    <WorkspaceProvider>
      <AppLayout>{children}</AppLayout>
    </WorkspaceProvider>
  );
}
