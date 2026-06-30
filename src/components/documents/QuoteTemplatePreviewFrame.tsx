"use client";

import { useEffect, useRef, useState } from "react";
import {
  A4_PREVIEW_WIDTH_PX,
  resolvePreviewScale,
  type QuotePreviewZoom,
} from "@/lib/documents/quoteSettingsEditorStorage";
import styles from "./quote-template-preview-frame.module.css";

type QuoteTemplatePreviewFrameProps = {
  zoom: QuotePreviewZoom;
  children: React.ReactNode;
};

/**
 * Centers an A4-width document preview with fit / 75% / 100% zoom.
 * Zoom is visual only — does not mutate template data.
 */
export function QuoteTemplatePreviewFrame({ zoom, children }: QuoteTemplatePreviewFrameProps) {
  const viewportRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const [viewportWidth, setViewportWidth] = useState(A4_PREVIEW_WIDTH_PX);
  const [contentHeight, setContentHeight] = useState(1123);

  useEffect(() => {
    const el = viewportRef.current;
    if (!el) return;

    const update = () => setViewportWidth(el.clientWidth);
    update();

    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    const el = contentRef.current;
    if (!el) return;

    const update = () => setContentHeight(el.offsetHeight);
    update();

    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, [children]);

  const scale = resolvePreviewScale(zoom, viewportWidth);
  const scaledWidth = A4_PREVIEW_WIDTH_PX * scale;
  const scaledHeight = contentHeight * scale;

  return (
    <div ref={viewportRef} className={styles.viewport}>
      <div className={styles.center}>
        <div className={styles.scaledSlot} style={{ width: scaledWidth, height: scaledHeight }}>
          <div
            ref={contentRef}
            className={styles.scaledInner}
            style={{
              width: A4_PREVIEW_WIDTH_PX,
              transform: `scale(${scale})`,
            }}
          >
            <div className={styles.pageShell}>{children}</div>
          </div>
        </div>
      </div>
    </div>
  );
}
