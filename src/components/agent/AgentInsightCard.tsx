"use client";

import type { AgentSuggestedAction } from "@/lib/agent/managerAgentContract";
import { cn } from "@/lib/utils";
import { AlertTriangle, ArrowRight, Info, Sparkles, TrendingUp } from "lucide-react";

type Props = {
  severity: "info" | "warning" | "critical" | "opportunity";
  title: string;
  message: string;
  reason?: string;
  requiresConfirmation?: boolean;
  suggestedAction?: AgentSuggestedAction;
  onAction?: (action: AgentSuggestedAction) => void;
  confirmLabel?: string;
};

const severityStyles = {
  info: "border-[#CBD5E1] bg-white",
  warning: "border-amber-300 bg-amber-50/70 dark:bg-amber-950/20",
  critical: "border-red-300 bg-red-50/70 dark:bg-red-950/20",
  opportunity: "border-emerald-300 bg-emerald-50/70 dark:bg-emerald-950/20",
};

function SeverityIcon({ severity }: { severity: Props["severity"] }) {
  if (severity === "warning" || severity === "critical") {
    return <AlertTriangle className="size-4 shrink-0 text-amber-600" aria-hidden />;
  }
  if (severity === "opportunity") {
    return <TrendingUp className="size-4 shrink-0 text-emerald-600" aria-hidden />;
  }
  return <Info className="size-4 shrink-0 text-[#64748B]" aria-hidden />;
}

export function AgentInsightCard({
  severity,
  title,
  message,
  reason,
  requiresConfirmation,
  suggestedAction,
  onAction,
  confirmLabel,
}: Props) {
  return (
    <article className={cn("rounded-xl border p-4 shadow-sm", severityStyles[severity])}>
      <div className="flex items-start gap-3">
        <SeverityIcon severity={severity} />
        <div className="min-w-0 flex-1 space-y-2">
          <div>
            <h4 className="font-semibold text-[#0F2A4D] dark:text-foreground">{title}</h4>
            <p className="mt-1 text-sm text-[#475569] dark:text-muted-foreground leading-relaxed">
              {message}
            </p>
            {reason ? (
              <p className="mt-2 text-xs text-[#64748B]">{reason}</p>
            ) : null}
          </div>

          {requiresConfirmation && suggestedAction ? (
            <AgentActionPreview
              action={suggestedAction}
              onAction={onAction}
              confirmLabel={confirmLabel}
            />
          ) : null}
        </div>
      </div>
    </article>
  );
}

type PreviewProps = {
  action: AgentSuggestedAction;
  onAction?: (action: AgentSuggestedAction) => void;
  confirmLabel?: string;
};

export function AgentActionPreview({ action, onAction, confirmLabel }: PreviewProps) {
  return (
    <div className="rounded-lg border border-dashed border-[#CBD5E1] bg-[#F8FAFC] px-3 py-3 dark:bg-muted/20">
      <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-[#64748B]">
        <Sparkles className="size-3.5" aria-hidden />
        {confirmLabel ?? "Suggested action"}
      </div>
      <p className="mt-2 text-sm font-medium text-[#334155] dark:text-foreground">{action.label}</p>
      <p className="mt-1 text-sm text-[#64748B] leading-relaxed">{action.description}</p>
      {action.proposedPatch ? (
        <pre className="mt-2 overflow-x-auto rounded-md bg-white px-2 py-2 text-[11px] text-[#475569] dark:bg-background">
          {JSON.stringify(action.proposedPatch, null, 2)}
        </pre>
      ) : null}
      {onAction ? (
        <button
          type="button"
          onClick={() => onAction(action)}
          className="mt-3 inline-flex items-center gap-1 rounded-md bg-[#E95F2A] px-3 py-1.5 text-sm font-semibold text-white hover:bg-[#c95a30]"
        >
          {action.confirmationText ?? action.label}
          <ArrowRight className="size-4" aria-hidden />
        </button>
      ) : null}
    </div>
  );
}
