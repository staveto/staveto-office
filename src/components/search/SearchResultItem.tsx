"use client";

import {
  Briefcase,
  Car,
  ClipboardList,
  FileText,
  ImageIcon,
  MessageSquareWarning,
  StickyNote,
  UserRound,
  Wrench,
  Zap,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { SearchIndexItem, SearchIndexItemType } from "@/types/search";

const TYPE_ICONS: Record<SearchIndexItemType, LucideIcon> = {
  project: Briefcase,
  offer: FileText,
  task: ClipboardList,
  customer: UserRound,
  document: FileText,
  photo: ImageIcon,
  member: UserRound,
  vehicle: Car,
  tool: Wrench,
  issue: MessageSquareWarning,
  note: StickyNote,
  action: Zap,
};

function contextLine(item: SearchIndexItem): string | null {
  const parts: string[] = [];
  if (item.relatedProjectName) parts.push(item.relatedProjectName);
  if (item.relatedCustomerName) parts.push(item.relatedCustomerName);
  if (item.subtitle && !parts.includes(item.subtitle)) parts.push(item.subtitle);
  return parts.length > 0 ? parts.join(" · ") : null;
}

type SearchResultItemProps = {
  item: SearchIndexItem;
  typeLabel: string;
  selected?: boolean;
  index: number;
  onSelect: (item: SearchIndexItem) => void;
  onHover: (index: number) => void;
};

export function SearchResultItem({
  item,
  typeLabel,
  selected = false,
  index,
  onSelect,
  onHover,
}: SearchResultItemProps) {
  const Icon = TYPE_ICONS[item.type] ?? FileText;
  const context = contextLine(item);

  return (
    <button
      type="button"
      role="option"
      aria-selected={selected}
      data-search-index={index}
      onClick={() => onSelect(item)}
      onMouseEnter={() => onHover(index)}
      className={cn(
        "flex w-full items-start gap-3 rounded-lg px-3 py-2.5 text-left transition-colors",
        "hover:bg-muted/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40",
        selected && "bg-muted"
      )}
    >
      <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
        <Icon className="size-4" aria-hidden />
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
          <span className="truncate font-medium text-foreground">{item.title}</span>
          {item.status ? (
            <span className="shrink-0 rounded-md bg-muted px-1.5 py-0.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
              {item.status}
            </span>
          ) : null}
        </span>
        <span className="mt-0.5 block text-xs text-muted-foreground">{typeLabel}</span>
        {context ? (
          <span className="mt-0.5 block truncate text-xs text-muted-foreground/90">{context}</span>
        ) : null}
      </span>
    </button>
  );
}
