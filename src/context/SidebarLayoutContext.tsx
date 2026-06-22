"use client";

import React, { createContext, useCallback, useContext, useEffect, useState } from "react";
import {
  readSidebarExpanded,
  SIDEBAR_WIDTH_COLLAPSED_PX,
  SIDEBAR_WIDTH_EXPANDED_PX,
  writeSidebarExpanded,
} from "@/lib/sidebarLayout";

type SidebarLayoutContextValue = {
  expanded: boolean;
  setExpanded: (value: boolean) => void;
  toggleExpanded: () => void;
  widthPx: number;
};

const SidebarLayoutContext = createContext<SidebarLayoutContextValue | null>(null);

export function SidebarLayoutProvider({ children }: { children: React.ReactNode }) {
  const [expanded, setExpandedState] = useState(true);

  useEffect(() => {
    setExpandedState(readSidebarExpanded());
  }, []);

  const setExpanded = useCallback((value: boolean) => {
    setExpandedState(value);
    writeSidebarExpanded(value);
  }, []);

  const toggleExpanded = useCallback(() => {
    setExpandedState((prev) => {
      const next = !prev;
      writeSidebarExpanded(next);
      return next;
    });
  }, []);

  const widthPx = expanded ? SIDEBAR_WIDTH_EXPANDED_PX : SIDEBAR_WIDTH_COLLAPSED_PX;

  return (
    <SidebarLayoutContext.Provider value={{ expanded, setExpanded, toggleExpanded, widthPx }}>
      {children}
    </SidebarLayoutContext.Provider>
  );
}

export function useSidebarLayout() {
  const ctx = useContext(SidebarLayoutContext);
  if (!ctx) throw new Error("useSidebarLayout must be used within SidebarLayoutProvider");
  return ctx;
}
