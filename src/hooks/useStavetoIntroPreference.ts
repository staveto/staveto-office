"use client";

import { startTransition, useCallback, useEffect, useRef, useState } from "react";

export const STORAGE_LAST_SHOWN = "staveto_flyover_last_shown";
export const STORAGE_DISABLED = "staveto_flyover_disabled";

function todayDateKey(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function readFlyoverDisabled(): boolean {
  if (typeof window === "undefined") return false;
  const v = window.localStorage.getItem(STORAGE_DISABLED);
  return v === "1" || v === "true";
}

export function readFlyoverLastShown(): string | null {
  if (typeof window === "undefined") return null;
  return window.localStorage.getItem(STORAGE_LAST_SHOWN);
}

function shouldShowIntro(forceIntro: boolean): boolean {
  if (typeof window === "undefined") return false;
  if (forceIntro) return true;
  if (readFlyoverDisabled()) return false;
  const last = readFlyoverLastShown();
  return last !== todayDateKey();
}

function markShownToday(): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(STORAGE_LAST_SHOWN, todayDateKey());
}

type Options = {
  /** QA: `?intro=1` bypasses daily limit and disabled flag. */
  forceIntro?: boolean;
};

export function useStavetoIntroPreference(options?: Options) {
  const forceIntro = options?.forceIntro === true;
  const forceRef = useRef(forceIntro);
  forceRef.current = forceIntro;

  const [ready, setReady] = useState(false);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const disabled = readFlyoverDisabled();
    const lastShown = readFlyoverLastShown();
    const shouldShow = shouldShowIntro(forceRef.current);

    if (process.env.NODE_ENV === "development") {
      console.log("[StavetoFlyoverIntro]", {
        disabled,
        lastShown,
        forceIntro: forceRef.current,
        shouldShow,
      });
    }

    startTransition(() => {
      setVisible(shouldShow);
      setReady(true);
    });
  }, [forceIntro]);

  const dismiss = useCallback(() => {
    if (!forceRef.current) {
      markShownToday();
    }
    setVisible(false);
  }, []);

  const disableAutoShow = useCallback(() => {
    if (typeof window !== "undefined") {
      window.localStorage.setItem(STORAGE_DISABLED, "1");
    }
    markShownToday();
    setVisible(false);
  }, []);

  return {
    ready,
    visible,
    dismiss,
    disableAutoShow,
    autoShowDisabled: !forceIntro && ready && readFlyoverDisabled(),
    forceIntro,
  };
}
