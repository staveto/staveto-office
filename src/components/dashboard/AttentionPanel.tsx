import Link from "next/link";
import { AlertCircle, ChevronRight } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "./EmptyState";
import { cn } from "@/lib/utils";

export type AttentionAlert = {
  id: string;
  label: string;
  count: number;
  href?: string;
};

type AttentionPanelProps = {
  title: string;
  emptyMessage: string;
  alerts: AttentionAlert[];
};

export function AttentionPanel({ title, emptyMessage, alerts }: AttentionPanelProps) {
  const hasAlerts = alerts.length > 0;

  return (
    <Card className="border-l-4 border-l-[#e06737] bg-card shadow-sm">
      <CardHeader className="flex flex-row items-center gap-2 space-y-0 pb-2 pt-4">
        <AlertCircle className="size-4 text-[#e06737]" aria-hidden />
        <CardTitle className="text-base font-semibold">{title}</CardTitle>
      </CardHeader>
      <CardContent className="pb-4 pt-0">
        {hasAlerts ? (
          <ul className="space-y-2" role="list">
            {alerts.map((alert) => {
              const row = (
                <>
                  <span>{alert.label}</span>
                  <span className="flex items-center gap-1 font-semibold tabular-nums text-[#1D376A]">
                    {alert.count}
                    {alert.href ? (
                      <ChevronRight className="size-4 opacity-60" aria-hidden />
                    ) : null}
                  </span>
                </>
              );
              return (
                <li key={alert.id}>
                  {alert.href ? (
                    <Link
                      href={alert.href}
                      className={cn(
                        "flex items-center justify-between rounded-md bg-[#1D376A]/5 px-3 py-2 text-sm",
                        "transition-colors hover:bg-[#1D376A]/10",
                        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#e06737]/50"
                      )}
                    >
                      {row}
                    </Link>
                  ) : (
                    <div className="flex items-center justify-between rounded-md bg-[#1D376A]/5 px-3 py-2 text-sm">
                      {row}
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        ) : (
          <EmptyState message={emptyMessage} className="py-4" />
        )}
      </CardContent>
    </Card>
  );
}
