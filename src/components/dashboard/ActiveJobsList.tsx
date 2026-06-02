import Link from "next/link";
import { ArrowRight, FolderKanban } from "lucide-react";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { EmptyState } from "./EmptyState";
import type { DashboardJobPreview } from "@/lib/dashboardStats";

type ActiveJobsListProps = {
  title: string;
  jobs: DashboardJobPreview[];
  loading?: boolean;
  viewAllLabel: string;
  viewAllHref: string;
  emptyMessage: string;
  emptyCtaLabel: string;
  emptyCtaHref: string;
};

export function ActiveJobsList({
  title,
  jobs,
  loading = false,
  viewAllLabel,
  viewAllHref,
  emptyMessage,
  emptyCtaLabel,
  emptyCtaHref,
}: ActiveJobsListProps) {
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
        ) : jobs.length === 0 ? (
          <EmptyState
            message={emptyMessage}
            className="py-4"
          />
        ) : (
          <ul className="divide-y divide-border" role="list">
            {jobs.map((job) => (
              <li key={job.id}>
                <Link
                  href={`/app/projects/${job.id}`}
                  className={cn(
                    "flex items-start gap-3 py-2.5 transition-colors rounded-md -mx-1 px-1",
                    "hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#e06737]/50"
                  )}
                >
                  <FolderKanban
                    className="mt-0.5 size-4 shrink-0 text-[#1D376A]/70"
                    aria-hidden
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium">{job.name}</span>
                    {job.location ? (
                      <span className="block truncate text-xs text-muted-foreground">
                        {job.location}
                      </span>
                    ) : null}
                  </span>
                  <ArrowRight className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                </Link>
              </li>
            ))}
          </ul>
        )}
        {!loading && jobs.length === 0 ? (
          <Link
            href={emptyCtaHref}
            className={cn(buttonVariants({ size: "sm" }), "mt-3 w-full sm:w-auto")}
          >
            {emptyCtaLabel}
          </Link>
        ) : null}
      </CardContent>
      {!loading && jobs.length > 0 ? (
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
