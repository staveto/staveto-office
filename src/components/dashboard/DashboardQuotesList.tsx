import Link from "next/link";
import { ArrowRight, FileText } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { EmptyState } from "./EmptyState";
import type { DashboardQuotePreview } from "@/lib/dashboardStats";
import type { QuoteStatus } from "@/lib/quotes";

type DashboardQuotesListProps = {
  title: string;
  quotes: DashboardQuotePreview[];
  loading?: boolean;
  viewAllLabel: string;
  viewAllHref: string;
  emptyMessage: string;
  statusLabel: (status: QuoteStatus) => string;
};

export function DashboardQuotesList({
  title,
  quotes,
  loading = false,
  viewAllLabel,
  viewAllHref,
  emptyMessage,
  statusLabel,
}: DashboardQuotesListProps) {
  return (
    <Card className="bg-card shadow-sm">
      <CardHeader className="pb-2 pt-4">
        <CardTitle className="text-base font-semibold">{title}</CardTitle>
      </CardHeader>
      <CardContent className="pt-0">
        {loading ? (
          <div className="space-y-2 animate-pulse">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="h-12 rounded-md bg-muted" />
            ))}
          </div>
        ) : quotes.length === 0 ? (
          <EmptyState message={emptyMessage} className="py-4" />
        ) : (
          <ul className="divide-y divide-border" role="list">
            {quotes.map((quote) => (
              <li key={quote.id}>
                <Link
                  href={`/app/quotes/${quote.id}`}
                  className={cn(
                    "flex items-start gap-3 py-2.5 transition-colors rounded-md -mx-1 px-1",
                    "hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#e06737]/50"
                  )}
                >
                  <FileText
                    className="mt-0.5 size-4 shrink-0 text-[#1D376A]/70"
                    aria-hidden
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium">{quote.title}</span>
                    {quote.clientName ? (
                      <span className="block truncate text-xs text-muted-foreground">
                        {quote.clientName}
                      </span>
                    ) : null}
                  </span>
                  <Badge variant="secondary" className="shrink-0 text-xs">
                    {statusLabel(quote.status)}
                  </Badge>
                  <ArrowRight className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
      {!loading && quotes.length > 0 ? (
        <CardFooter className="border-t pt-3 pb-4">
          <Link
            href={viewAllHref}
            className="text-sm font-medium text-[#e06737] hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#e06737]/50 rounded"
          >
            {viewAllLabel}
          </Link>
        </CardFooter>
      ) : null}
    </Card>
  );
}
