"use client";

import { useI18n } from "@/i18n/I18nContext";
import type { SearchCategoryGroup, SearchIndexItem } from "@/types/search";
import { SearchResultItem } from "./SearchResultItem";

type SearchCategoryGroupProps = {
  group: SearchCategoryGroup;
  selectedIndex: number;
  indexOffset: number;
  onSelect: (item: SearchIndexItem) => void;
  onHover: (index: number) => void;
};

export function SearchCategoryGroupBlock({
  group,
  selectedIndex,
  indexOffset,
  onSelect,
  onHover,
}: SearchCategoryGroupProps) {
  const { t } = useI18n();
  const labelKey = `search.category.${group.type}` as const;

  return (
    <div role="group" aria-label={t(labelKey)}>
      <p className="px-3 pb-1 pt-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
        {t(labelKey)}
      </p>
      <ul className="space-y-0.5" role="listbox">
        {group.items.map((item, i) => {
          const flatIndex = indexOffset + i;
          return (
            <li key={`${item.type}-${item.id}`}>
              <SearchResultItem
                item={item}
                typeLabel={t(labelKey)}
                selected={selectedIndex === flatIndex}
                index={flatIndex}
                onSelect={onSelect}
                onHover={onHover}
              />
            </li>
          );
        })}
      </ul>
    </div>
  );
}
