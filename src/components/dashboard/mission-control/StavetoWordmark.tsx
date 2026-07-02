"use client";

import { cn } from "@/lib/utils";

type StavetoWordmarkProps = {
  className?: string;
  /** Lighten logo on dark cinematic backgrounds (flyover intro). */
  tone?: "default" | "onDark";
};

export function StavetoWordmark({ className, tone = "default" }: StavetoWordmarkProps) {
  return (
    <div className={cn("inline-flex select-none items-center", className)} aria-label="Staveto">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src="/staveto-logo.png"
        alt="Staveto"
        className={cn(
          "h-auto w-[118px] object-contain sm:w-[132px]",
          tone === "onDark" ? "mix-blend-screen" : "dark:mix-blend-screen"
        )}
      />
    </div>
  );
}
