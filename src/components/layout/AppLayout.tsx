"use client";

import { useState, useEffect } from "react";
import { usePathname } from "next/navigation";
import { Sidebar } from "./Sidebar";
import { Header } from "./Header";
import { CompanyContextBar } from "./CompanyContextBar";
import { TenantGate } from "@/components/tenant/TenantGate";
import { cn } from "@/lib/utils";
import { SidebarLayoutProvider, useSidebarLayout } from "@/context/SidebarLayoutContext";

function AppLayoutInner({ children }: { children: React.ReactNode }) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const pathname = usePathname();
  const { widthPx, setExpanded } = useSidebarLayout();
  const isNewJobFlow = pathname.startsWith("/app/projects/new");

  useEffect(() => {
    queueMicrotask(() => setSidebarOpen(false));
  }, [pathname]);

  useEffect(() => {
    if (isNewJobFlow) setExpanded(false);
  }, [isNewJobFlow, setExpanded]);

  return (
    <div className="flex min-h-screen bg-background">
      <div
        className={cn(
          "hidden md:block sticky top-0 z-40 h-screen shrink-0 overflow-visible transition-[width,opacity] duration-200 ease-out",
          isNewJobFlow && "opacity-70"
        )}
        style={{ width: widthPx }}
      >
        <Sidebar isMobile={false} />
      </div>

      {/* Mobile sidebar overlay */}
      {sidebarOpen && (
        <>
          <div
            className="fixed inset-0 z-40 bg-black/50 md:hidden"
            onClick={() => setSidebarOpen(false)}
            aria-hidden
          />
          <div className="fixed inset-y-0 left-0 z-50 md:hidden">
            <Sidebar
              onClose={() => setSidebarOpen(false)}
              isMobile={true}
            />
          </div>
        </>
      )}

      {/* Main content */}
      <div className="flex flex-1 flex-col min-w-0">
        <Header
          onMenuClick={() => setSidebarOpen((o) => !o)}
          sidebarOpen={sidebarOpen}
        />
        <CompanyContextBar />
        <main className="flex-1 overflow-auto p-4 md:p-6">
          <div className="mx-auto max-w-6xl">
            <TenantGate>{children}</TenantGate>
          </div>
        </main>
      </div>
    </div>
  );
}

export function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <SidebarLayoutProvider>
      <AppLayoutInner>{children}</AppLayoutInner>
    </SidebarLayoutProvider>
  );
}
