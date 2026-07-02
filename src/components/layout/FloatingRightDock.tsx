"use client";

import { BusinessMessagingDrawer } from "@/components/business-chat/BusinessMessagingDrawer";
import { ManagerAgentPanel } from "@/components/agent/ManagerAgentPanel";
import { getFloatingDockLayout } from "@/lib/agent/managerAgentDisplay";
import { useFloatingDock } from "@/context/FloatingDockContext";
import { cn } from "@/lib/utils";

export function FloatingRightDock() {
  const { messagesExpanded } = useFloatingDock();
  const layout = getFloatingDockLayout(messagesExpanded);

  return (
    <div className={layout.dockClassName} data-testid="floating-right-dock">
      <BusinessMessagingDrawer embedded />
      <ManagerAgentPanel embedded messagesExpanded={messagesExpanded} layout={layout} />
    </div>
  );
}
