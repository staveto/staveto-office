"use client";

import { useCallback, useEffect, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

export type OperationsViewMode = "overview" | "map";

const STORAGE_KEY = "staveto-operations-view";

function readStoredView(): OperationsViewMode {
  if (typeof window === "undefined") return "overview";
  const raw = window.localStorage.getItem(STORAGE_KEY);
  return raw === "map" ? "map" : "overview";
}

function parseViewParam(raw: string | null): OperationsViewMode | null {
  if (raw === "map" || raw === "overview") return raw;
  return null;
}

export function useOperationsView(): {
  view: OperationsViewMode;
  setView: (next: OperationsViewMode) => void;
  ready: boolean;
} {
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const [view, setViewState] = useState<OperationsViewMode>("overview");
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const fromUrl = parseViewParam(searchParams.get("view"));
    const resolved = fromUrl ?? readStoredView();
    setViewState(resolved);
    if (fromUrl) {
      window.localStorage.setItem(STORAGE_KEY, fromUrl);
    }
    setReady(true);
  }, [searchParams]);

  const setView = useCallback(
    (next: OperationsViewMode) => {
      window.localStorage.setItem(STORAGE_KEY, next);
      setViewState(next);
      const params = new URLSearchParams(searchParams.toString());
      params.set("view", next);
      const qs = params.toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    },
    [pathname, router, searchParams]
  );

  return { view, setView, ready };
}
