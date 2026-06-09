"use client";

import { useEffect, useMemo, useState } from "react";
import { Loader2, Maximize2, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { useI18n } from "@/i18n/I18nContext";
import { cn } from "@/lib/utils";
import {
  filterChatTeamMembers,
  listChatTeamMembers,
  type ChatTeamMember,
} from "@/services/business/businessChatTeamService";

function memberInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return name.slice(0, 2).toUpperCase();
}

type BusinessChatComposePanelProps = {
  orgId: string;
  currentUid: string;
  initialMembers?: ChatTeamMember[];
  onClose: () => void;
  onSelectMember: (member: ChatTeamMember) => void;
};

export function BusinessChatComposePanel({
  orgId,
  currentUid,
  initialMembers,
  onClose,
  onSelectMember,
}: BusinessChatComposePanelProps) {
  const { t } = useI18n();
  const [query, setQuery] = useState("");
  const [members, setMembers] = useState<ChatTeamMember[]>(initialMembers ?? []);
  const [loading, setLoading] = useState(!initialMembers?.length);
  const [error, setError] = useState<string | null>(null);
  const [activeIndex, setActiveIndex] = useState(0);

  useEffect(() => {
    if (initialMembers?.length) {
      setMembers(initialMembers);
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setError(null);
    listChatTeamMembers(orgId, currentUid)
      .then((rows) => {
        if (cancelled) return;
        setMembers(rows);
        setLoading(false);
      })
      .catch((e) => {
        if (cancelled) return;
        setError(e instanceof Error ? e.message : t("business.chat.error"));
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [orgId, currentUid, initialMembers, t]);

  const filtered = useMemo(() => filterChatTeamMembers(members, query), [members, query]);

  useEffect(() => {
    setActiveIndex(0);
  }, [query]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (filtered.length === 0) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIndex((i) => Math.min(i + 1, filtered.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIndex((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const picked = filtered[activeIndex];
      if (picked) onSelectMember(picked);
    } else if (e.key === "Escape") {
      onClose();
    }
  };

  return (
    <div className="absolute inset-0 z-10 flex flex-col bg-white">
      <div className="flex items-center justify-between border-b border-[#E2E8F0] px-4 py-3">
        <h3 className="text-sm font-semibold text-[#0F172A]">{t("business.chat.newMessageTitle")}</h3>
        <div className="flex items-center gap-1">
          <button
            type="button"
            className="p-1.5 rounded-md hover:bg-[#EEF2F7] text-muted-foreground"
            aria-label={t("business.chat.expand")}
          >
            <Maximize2 className="size-4" />
          </button>
          <button
            type="button"
            className="p-1.5 rounded-md hover:bg-[#EEF2F7] text-muted-foreground"
            onClick={onClose}
            aria-label={t("business.chat.close")}
          >
            <X className="size-4" />
          </button>
        </div>
      </div>

      <div className="px-4 py-3 border-b border-[#EEF2F7]">
        <Input
          autoFocus
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={t("business.chat.recipientPlaceholder")}
          className="border-0 shadow-none px-0 h-9 text-sm focus-visible:ring-0"
        />
      </div>

      <div className="flex-1 overflow-y-auto min-h-0">
        {loading ? (
          <div className="flex justify-center py-12">
            <Loader2 className="size-5 animate-spin text-muted-foreground" />
          </div>
        ) : error ? (
          <p className="p-4 text-sm text-destructive">{error}</p>
        ) : filtered.length === 0 ? (
          <p className="p-4 text-sm text-muted-foreground">{t("business.chat.noTeamMembers")}</p>
        ) : (
          <>
            <p className="px-4 pt-3 pb-1 text-xs font-semibold text-muted-foreground uppercase tracking-wide">
              {t("business.chat.suggested")}
            </p>
            <ul>
              {filtered.map((member, index) => (
                <li key={member.uid}>
                  <button
                    type="button"
                    className={cn(
                      "w-full flex items-center gap-3 px-4 py-2.5 text-left transition-colors",
                      index === activeIndex ? "bg-[#EEF4FF]" : "hover:bg-[#F8FAFC]"
                    )}
                    onMouseEnter={() => setActiveIndex(index)}
                    onClick={() => onSelectMember(member)}
                  >
                    <div className="flex size-10 shrink-0 items-center justify-center rounded-full bg-[#1D376A] text-xs font-bold text-white">
                      {memberInitials(member.displayName)}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold text-[#0F172A] truncate">{member.displayName}</p>
                      <p className="text-xs text-muted-foreground truncate">{t(member.roleLabelKey)}</p>
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          </>
        )}
      </div>
    </div>
  );
}
