"use client";

import { useState, useEffect } from "react";
import { usePathname } from "next/navigation";
import { Sidebar } from "./Sidebar";
import { Header } from "./Header";
import { TenantGate } from "@/components/tenant/TenantGate";
import { cn } from "@/lib/utils";
import { SidebarLayoutProvider, useSidebarLayout } from "@/context/SidebarLayoutContext";
import { EmailInboxBadgeProvider } from "@/context/EmailInboxBadgeContext";
import { BusinessMessagingDrawer } from "@/components/business-chat/BusinessMessagingDrawer";
import { FloatingRightDock } from "@/components/layout/FloatingRightDock";
import {
  ManagerAgentActionHandlersProvider,
  ManagerAgentScreenDataProvider,
} from "@/context/ManagerAgentContext";
import { FloatingDockProvider } from "@/context/FloatingDockContext";
import { SettingsSidebar } from "@/components/settings/SettingsSidebar";
import { isSettingsAreaPath } from "@/lib/settingsNavigation";

function AppLayoutInner({ children }: { children: React.ReactNode }) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const pathname = usePathname();
  const { widthPx, setExpanded } = useSidebarLayout();
  const isNewJobFlow = pathname.startsWith("/app/projects/new");
  const isSettingsMode = isSettingsAreaPath(pathname);
  const settingsSidebarWidth = 280;

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
          "hidden md:block sticky top-0 z-50 h-screen shrink-0 overflow-visible transition-[width,opacity] duration-200 ease-out",
          isNewJobFlow && !isSettingsMode && "opacity-70"
        )}
        style={{ width: isSettingsMode ? settingsSidebarWidth : widthPx }}
      >
        {isSettingsMode ? <SettingsSidebar /> : <Sidebar isMobile={false} />}
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
            {isSettingsMode ? (
              <SettingsSidebar onNavigate={() => setSidebarOpen(false)} />
            ) : (
              <Sidebar onClose={() => setSidebarOpen(false)} isMobile={true} />
            )}
          </div>
        </>
      )}

      {/* Main content */}
      <div className="flex flex-1 flex-col min-w-0">
        <Header
          onMenuClick={() => setSidebarOpen((o) => !o)}
          sidebarOpen={sidebarOpen}
        />
        <main className="flex-1 overflow-auto bg-[#eef2f6] p-4 dark:bg-background md:p-6">
          <div className={cn("mx-auto", isSettingsMode ? "max-w-6xl" : "max-w-6xl")}>
            <TenantGate>{children}</TenantGate>
          </div>
        </main>
        {!isSettingsMode ? <FloatingRightDock /> : null}
      </div>
    </div>
  );
}

export function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <SidebarLayoutProvider>
      <EmailInboxBadgeProvider>
        <ManagerAgentScreenDataProvider>
          <ManagerAgentActionHandlersProvider>
            <FloatingDockProvider>
              <AppLayoutInner>{children}</AppLayoutInner>
            </FloatingDockProvider>
          </ManagerAgentActionHandlersProvider>
        </ManagerAgentScreenDataProvider>
      </EmailInboxBadgeProvider>
    </SidebarLayoutProvider>
  );
}
