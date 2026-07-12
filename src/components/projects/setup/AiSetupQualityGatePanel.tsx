"use client";

import { AlertTriangle, CheckCircle2 } from "lucide-react";
import { useI18n } from "@/i18n/I18nContext";
import type { CompletenessFinding } from "@/lib/ai/electricalQuoteTypes";
import { cn } from "@/lib/utils";

type Props = {
  findings: CompletenessFinding[];
  blocked: boolean;
};

export function AiSetupQualityGatePanel({ findings, blocked }: Props) {
  const { t } = useI18n();
  const open = findings.filter((f) => f.status === "missing" || f.status === "needs_review");
  if (open.length === 0) return null;

  return (
    <div
      className={cn(
        "rounded-2xl border-2 px-4 py-4 space-y-3",
        blocked ? "border-amber-500 bg-amber-50" : "border-[#CBD5E1] bg-[#F8FAFC]"
      )}
      role="status"
    >
      <div className="flex items-start gap-2">
        <AlertTriangle
          className={cn("size-5 shrink-0 mt-0.5", blocked ? "text-amber-700" : "text-[#64748B]")}
        />
        <div>
          <h3 className="text-sm font-bold text-[#0F2A4D]">
            {t("projects.aiSetup.gate.title")}
          </h3>
          <p className="text-xs text-[#64748B] mt-0.5 leading-relaxed">
            {blocked
              ? t("projects.aiSetup.gate.blocked")
              : t("projects.aiSetup.gate.review")}
          </p>
        </div>
      </div>
      <ul className="space-y-2">
        {open.map((f) => (
          <li
            key={f.category}
            className="flex gap-2 text-sm text-[#334155] leading-snug"
          >
            {f.status === "missing" ? (
              <AlertTriangle className="size-4 shrink-0 mt-0.5 text-amber-600" />
            ) : (
              <CheckCircle2 className="size-4 shrink-0 mt-0.5 text-[#94A3B8]" />
            )}
            <span>{f.messageSk}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
