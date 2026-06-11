"use client";

import { cn } from "@/lib/utils";

type StavetoWordmarkProps = {
  className?: string;
};

export function StavetoWordmark({ className }: StavetoWordmarkProps) {
  return (
    <div className={cn("inline-flex select-none items-center", className)} aria-label="Staveto">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src="/logo.png"
        alt="Staveto"
        className="h-auto w-[118px] object-contain dark:mix-blend-screen sm:w-[132px]"
      />
    </div>
  );
}
