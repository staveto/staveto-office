import { cn } from "@/lib/utils";

type EmptyStateProps = {
  message: string;
  hint?: string;
  className?: string;
};

export function EmptyState({ message, hint, className }: EmptyStateProps) {
  return (
    <div
      className={cn(
        "rounded-lg border border-dashed border-border bg-background/60 px-4 py-6 text-center",
        className
      )}
    >
      <p className="text-sm text-muted-foreground">{message}</p>
      {hint ? (
        <p className="mt-1 text-xs text-muted-foreground/80">{hint}</p>
      ) : null}
    </div>
  );
}
