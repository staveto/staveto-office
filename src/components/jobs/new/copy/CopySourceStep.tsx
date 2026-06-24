"use client";

import { Search } from "lucide-react";
import { useMemo, useState } from "react";
import { Input } from "@/components/ui/input";
import { useI18n } from "@/i18n/I18nContext";
import type { ProjectDoc } from "@/lib/projects";
import { cn } from "@/lib/utils";
import { nj, njLargeChoice } from "../newJobFormStyles";

type Props = {
  projects: ProjectDoc[];
  loading: boolean;
  value: string | null;
  onChange: (projectId: string) => void;
  error?: string;
};

export function CopySourceStep({ projects, loading, value, onChange, error }: Props) {
  const { t } = useI18n();
  const [search, setSearch] = useState("");

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return projects.slice(0, 20);
    return projects
      .filter((p) => {
        const blob = [p.name, p.customerName, p.customerCompanyName, p.addressText, p.city]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();
        return blob.includes(q);
      })
      .slice(0, 20);
  }, [projects, search]);

  return (
    <div className="space-y-4">
      <p className="text-[15px] text-[#64748B] leading-relaxed max-w-2xl">
        {t("projects.new.step.copySourceLead")}
      </p>

      <div className="relative max-w-xl">
        <Search
          className="pointer-events-none absolute left-4 top-1/2 size-5 -translate-y-1/2 text-[#64748B]"
          aria-hidden
        />
        <Input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={t("projects.new.copyProjectPlaceholder")}
          className="h-12 rounded-xl border-[#CBD5E1] pl-12 text-[15px]"
          aria-label={t("projects.new.copyProjectPlaceholder")}
        />
      </div>

      {loading ? (
        <p className="text-sm text-[#64748B]">{t("common.loading")}</p>
      ) : filtered.length === 0 ? (
        <p className="rounded-xl bg-[#F6F8FB] px-5 py-4 text-[15px] text-[#475569]">
          {t("projects.new.copy.empty")}
        </p>
      ) : (
        <div
          className="space-y-2 max-w-2xl"
          role="radiogroup"
          aria-label={t("projects.new.step.copySourceTitle")}
        >
          {filtered.map((project) => {
            const selected = value === project.id;
            const subtitle = [project.customerName, project.customerCompanyName, project.city]
              .filter(Boolean)
              .join(" · ");
            return (
              <button
                key={project.id}
                type="button"
                role="radio"
                aria-checked={selected}
                onClick={() => onChange(project.id)}
                className={cn(njLargeChoice(selected), "w-full text-left")}
              >
                <span className="min-w-0 flex-1">
                  <span className="block text-base font-bold text-[#0F2A4D] truncate">
                    {project.name}
                  </span>
                  {subtitle ? (
                    <span className="mt-1 block text-sm text-[#64748B] truncate">{subtitle}</span>
                  ) : null}
                </span>
              </button>
            );
          })}
        </div>
      )}

      {error ? (
        <p className={nj.error} role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
