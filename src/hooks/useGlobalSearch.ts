"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useAuth } from "@/context/AuthContext";
import { useWorkspace } from "@/context/WorkspaceContext";
import { ensureAuthTokenReady, getCallable } from "@/lib/firebase";
import {
  EMPTY_STATE_QUICK_ACTIONS,
  SEARCH_CATEGORY_ORDER,
  type GlobalSearchResponse,
  type SearchCategoryGroup,
  type SearchIndexItem,
} from "@/types/search";
import { isCompanyWorkspaceType } from "@/types/workspace";

const DEBOUNCE_MS = 280;

function groupResults(items: SearchIndexItem[]): SearchCategoryGroup[] {
  const byType = new Map<string, SearchIndexItem[]>();
  for (const item of items) {
    const list = byType.get(item.type) ?? [];
    list.push(item);
    byType.set(item.type, list);
  }
  return SEARCH_CATEGORY_ORDER.filter((type) => byType.has(type)).map((type) => ({
    type,
    items: byType.get(type) ?? [],
  }));
}

export function useGlobalSearch(query: string, enabled: boolean) {
  const { user } = useAuth();
  const { activeWorkspace } = useWorkspace();
  const [results, setResults] = useState<SearchIndexItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [aiFallbackAvailable, setAiFallbackAvailable] = useState(false);
  const requestIdRef = useRef(0);

  const orgId = useMemo(() => {
    if (!activeWorkspace || !user) return null;
    if (isCompanyWorkspaceType(activeWorkspace.type)) {
      return activeWorkspace.orgId ?? activeWorkspace.id;
    }
    return user.id;
  }, [activeWorkspace, user]);

  const runSearch = useCallback(
    async (q: string) => {
      if (!enabled || !user || !orgId || !q.trim()) {
        setResults([]);
        setError(null);
        setLoading(false);
        setAiFallbackAvailable(false);
        return;
      }

      const requestId = ++requestIdRef.current;
      setLoading(true);
      setError(null);

      try {
        await ensureAuthTokenReady();
        const callable = getCallable<
          {
            orgId: string;
            workspaceId?: string;
            companyId?: string;
            query: string;
            limit?: number;
          },
          GlobalSearchResponse
        >("globalSearch", { timeoutMs: 55_000 });

        const companyId = isCompanyWorkspaceType(activeWorkspace?.type ?? "personal")
          ? orgId
          : undefined;

        const res = await callable({
          orgId,
          workspaceId: activeWorkspace?.id ?? orgId,
          companyId,
          query: q.trim(),
          limit: 30,
        });

        if (requestId !== requestIdRef.current) return;

        setResults(res.data?.results ?? []);
        setAiFallbackAvailable(Boolean(res.data?.aiFallbackAvailable));
      } catch (err) {
        if (requestId !== requestIdRef.current) return;
        setResults([]);
        setError(err instanceof Error ? err.message : "Search failed");
        setAiFallbackAvailable(false);
      } finally {
        if (requestId === requestIdRef.current) {
          setLoading(false);
        }
      }
    },
    [activeWorkspace?.id, activeWorkspace?.type, enabled, orgId, user]
  );

  useEffect(() => {
    if (!enabled) return;
    const trimmed = query.trim();
    if (!trimmed) {
      setResults([]);
      setError(null);
      setLoading(false);
      return;
    }

    const timer = window.setTimeout(() => {
      void runSearch(trimmed);
    }, DEBOUNCE_MS);

    return () => window.clearTimeout(timer);
  }, [query, enabled, runSearch]);

  const groups = useMemo(() => groupResults(results), [results]);

  const flatResults = useMemo(() => groups.flatMap((g) => g.items), [groups]);

  const quickActions = useMemo(() => {
    if (results.length > 0) {
      return results.filter((r) => r.type === "action");
    }
    return EMPTY_STATE_QUICK_ACTIONS;
  }, [results]);

  return {
    groups,
    flatResults,
    loading,
    error,
    aiFallbackAvailable,
    quickActions,
    hasQuery: query.trim().length > 0,
    isEmpty: query.trim().length > 0 && !loading && results.length === 0 && !error,
  };
}
