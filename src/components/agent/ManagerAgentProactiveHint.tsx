"use client";

import { Sparkles, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useI18n } from "@/i18n/I18nContext";
import type { AgentInsight } from "@/lib/agent/managerAgentContract";
import { cn } from "@/lib/utils";

type Props = {
  insight: AgentInsight;
  onOpen: () => void;
  onDismiss: () => void;
  onSnooze: () => void;
  className?: string;
};

export function ManagerAgentProactiveHint({
  insight,
  onOpen,
  onDismiss,
  onSnooze,
  className,
}: Props) {
  const { t } = useI18n();

  return (
    <div
      role="status"
      className={cn(
        "w-[min(320px,calc(100vw-2rem))] rounded-xl border border-[#CBD5E1] bg-white p-3 shadow-[0_12px_36px_rgba(15,42,77,0.16)] dark:bg-background",
        className
      )}
    >
      <div className="flex items-start gap-2">
        <Sparkles className="mt-0.5 size-4 shrink-0 text-[#E95F2A]" aria-hidden />
        <div className="min-w-0 flex-1">
          <p className="text-xs font-semibold uppercase tracking-wide text-[#64748B]">
            {t("agent.proactive.title")}
          </p>
          <p className="mt-1 text-sm font-semibold text-[#0F2A4D] dark:text-foreground">
            {insight.title}
          </p>
          <p className="mt-1 text-sm leading-relaxed text-[#475569] dark:text-muted-foreground">
            {insight.message}
          </p>
        </div>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="size-7 shrink-0"
          onClick={onDismiss}
          aria-label={t("agent.proactive.dismiss")}
        >
          <X className="size-4" />
        </Button>
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        <Button
          type="button"
          size="sm"
          className="bg-[#E95F2A] hover:bg-[#c95a30] text-white"
          onClick={onOpen}
        >
          {t("agent.proactive.openAdvisor")}
        </Button>
        <Button type="button" size="sm" variant="outline" onClick={onSnooze}>
          {t("agent.snoozeOneHour")}
        </Button>
      </div>
    </div>
  );
}
