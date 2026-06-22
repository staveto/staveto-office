export const SIDEBAR_WIDTH_COLLAPSED_PX = 72;
export const SIDEBAR_WIDTH_EXPANDED_PX = 280;

export const SIDEBAR_EXPANDED_STORAGE_KEY = "staveto.sidebar.expanded";

export function readSidebarExpanded(): boolean {
  if (typeof window === "undefined") return true;
  try {
    const stored = localStorage.getItem(SIDEBAR_EXPANDED_STORAGE_KEY);
    if (stored === null) return true;
    return stored === "1";
  } catch {
    return true;
  }
}

export function writeSidebarExpanded(expanded: boolean): void {
  try {
    localStorage.setItem(SIDEBAR_EXPANDED_STORAGE_KEY, expanded ? "1" : "0");
  } catch {
    /* ignore */
  }
}
