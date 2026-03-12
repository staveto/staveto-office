"use client";

import { useState, useEffect } from "react";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { Sidebar } from "./Sidebar";
import { Header } from "./Header";

export function AppLayout({ children }: { children: React.ReactNode }) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [sidebarCollapsed] = useState(false);
  const pathname = usePathname();

  useEffect(() => {
    setSidebarOpen(false);
  }, [pathname]);

  return (
    <div className="flex min-h-screen bg-background">
      {/* Desktop sidebar - hidden on mobile when closed */}
      <div
        className={cn(
          "hidden md:block shrink-0",
          sidebarCollapsed ? "w-16" : "w-56"
        )}
      >
        <Sidebar collapsed={sidebarCollapsed} isMobile={false} />
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
        <main className="flex-1 overflow-auto p-4 md:p-6">
          <div className="mx-auto max-w-6xl">{children}</div>
        </main>
      </div>
    </div>
  );
}
