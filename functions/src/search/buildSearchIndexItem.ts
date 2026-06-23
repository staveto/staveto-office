/**
 * Normalized search index item — used by globalSearch and future index writers.
 * TODO: Firestore triggers can call buildSearchIndexItem* helpers to keep
 * organizations/{orgId}/searchIndex/{itemId} in sync.
 */
export type SearchIndexItemType =
  | "project"
  | "offer"
  | "task"
  | "customer"
  | "document"
  | "photo"
  | "member"
  | "vehicle"
  | "tool"
  | "issue"
  | "note"
  | "action";

export type SearchVisibility = {
  owner?: boolean;
  manager?: boolean;
  teamleader?: boolean;
  employee?: boolean;
};

export type SearchIndexItem = {
  id: string;
  type: SearchIndexItemType;
  title: string;
  subtitle?: string;
  status?: string;
  relatedProjectId?: string;
  relatedProjectName?: string;
  relatedCustomerId?: string;
  relatedCustomerName?: string;
  searchText: string;
  keywords: string[];
  route: string;
  sourceCollection: string;
  sourceId: string;
  visibility?: SearchVisibility;
  createdAt?: FirebaseFirestore.Timestamp | string;
  updatedAt?: FirebaseFirestore.Timestamp | string;
};

export function tokenizeForSearch(...parts: Array<string | null | undefined>): string {
  return parts
    .filter((p): p is string => typeof p === "string" && p.trim().length > 0)
    .join(" ")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

export function buildKeywords(...parts: Array<string | null | undefined>): string[] {
  const raw = tokenizeForSearch(...parts);
  const tokens = new Set<string>();
  for (const word of raw.split(/\s+/)) {
    if (word.length >= 2) tokens.add(word);
  }
  return [...tokens];
}

export function buildSearchIndexItem(
  partial: Omit<SearchIndexItem, "searchText" | "keywords"> & {
    searchParts?: Array<string | null | undefined>;
    extraKeywords?: string[];
  }
): SearchIndexItem {
  const { searchParts, extraKeywords, ...rest } = partial;
  const searchText = tokenizeForSearch(rest.title, rest.subtitle, ...(searchParts ?? []));
  const keywords = [
    ...new Set([...buildKeywords(rest.title, rest.subtitle, ...(searchParts ?? [])), ...(extraKeywords ?? [])]),
  ];
  return { ...rest, searchText, keywords };
}

export function matchesSearchQuery(item: SearchIndexItem, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return false;
  const haystack = `${item.searchText} ${item.keywords.join(" ")}`;
  return q.split(/\s+/).every((token) => token.length > 0 && haystack.includes(token));
}
