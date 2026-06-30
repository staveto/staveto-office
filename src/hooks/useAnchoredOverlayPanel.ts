"use client";

import { useEffect, useState, type CSSProperties, type RefObject } from "react";

const DEFAULT_PANEL_WIDTH = 352;
const VIEWPORT_MARGIN = 8;

export function useAnchoredOverlayPanel(
  open: boolean,
  anchorRef: RefObject<HTMLElement | null>,
  panelWidth = DEFAULT_PANEL_WIDTH
): CSSProperties {
  const [style, setStyle] = useState<CSSProperties>({});

  useEffect(() => {
    if (!open) return;

    const update = () => {
      const anchor = anchorRef.current;
      if (!anchor) return;

      const rect = anchor.getBoundingClientRect();
      const width = Math.min(panelWidth, window.innerWidth - VIEWPORT_MARGIN * 2);
      let left = rect.right - width;
      left = Math.max(
        VIEWPORT_MARGIN,
        Math.min(left, window.innerWidth - width - VIEWPORT_MARGIN)
      );
      const top = rect.bottom + VIEWPORT_MARGIN;
      const maxHeight = Math.max(
        160,
        window.innerHeight - top - VIEWPORT_MARGIN
      );

      setStyle({
        position: "fixed",
        top,
        left,
        width,
        maxHeight,
        zIndex: 200,
      });
    };

    update();
    window.addEventListener("resize", update);
    window.addEventListener("scroll", update, true);
    return () => {
      window.removeEventListener("resize", update);
      window.removeEventListener("scroll", update, true);
    };
  }, [open, anchorRef, panelWidth]);

  return style;
}
