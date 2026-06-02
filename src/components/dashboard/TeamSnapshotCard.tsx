import Link from "next/link";
import { Users, UserPlus } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type TeamSnapshotCardProps = {
  title: string;
  count: number | null;
  loading?: boolean;
  membersLabel: string;
  inviteLabel: string;
  membersHref: string;
  emptyHint?: string;
};

export function TeamSnapshotCard({
  title,
  count,
  loading = false,
  membersLabel,
  inviteLabel,
  membersHref,
  emptyHint,
}: TeamSnapshotCardProps) {
  return (
    <Card className="bg-card shadow-sm">
      <CardHeader className="pb-2 pt-4">
        <CardTitle className="flex items-center gap-2 text-base font-semibold">
          <Users className="size-4 text-[#1D376A]/80" aria-hidden />
          {title}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 pb-4 pt-0">
        {loading ? (
          <div className="h-8 w-24 animate-pulse rounded bg-muted" />
        ) : count !== null ? (
          <p className="text-2xl font-semibold tabular-nums text-[#1D376A]">{count}</p>
        ) : null}
        <p className="text-sm text-muted-foreground">{membersLabel}</p>
        {emptyHint && count === 1 ? (
          <p className="text-xs text-muted-foreground">{emptyHint}</p>
        ) : null}
        <div className="flex flex-wrap gap-2">
          <Link
            href={membersHref}
            className={cn(buttonVariants({ variant: "outline", size: "sm" }), "border-[#1D376A]/25")}
          >
            {membersLabel}
          </Link>
          <Link
            href="/app/members"
            className={cn(buttonVariants({ size: "sm" }), "bg-[#e06737] text-white hover:bg-[#c95a30]")}
          >
            <UserPlus className="size-4 mr-1.5" aria-hidden />
            {inviteLabel}
          </Link>
        </div>
      </CardContent>
    </Card>
  );
}
