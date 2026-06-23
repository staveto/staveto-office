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
  route: string;
  sourceCollection?: string;
  sourceId?: string;
};

export type GlobalSearchResponse = {
  query: string;
  results: SearchIndexItem[];
  /** TODO: When true and results empty, offer "Ask Staveto AI" fallback. */
  aiFallbackAvailable: boolean;
};

export const SEARCH_CATEGORY_ORDER: SearchIndexItemType[] = [
  "project",
  "offer",
  "task",
  "customer",
  "document",
  "photo",
  "member",
  "vehicle",
  "tool",
  "issue",
  "note",
  "action",
];

export type SearchCategoryGroup = {
  type: SearchIndexItemType;
  items: SearchIndexItem[];
};

export const EMPTY_STATE_QUICK_ACTIONS: SearchIndexItem[] = [
  {
    id: "quick-planning",
    type: "action",
    title: "Heute planen",
    subtitle: "Einsatzplanung öffnen",
    route: "/app/planning",
  },
  {
    id: "quick-quotes",
    type: "action",
    title: "Angebote prüfen",
    subtitle: "Offene Angebote",
    route: "/app/quotes",
  },
  {
    id: "quick-projects",
    type: "action",
    title: "Aufträge anzeigen",
    subtitle: "Alle Projekte",
    route: "/app/projects",
  },
];
