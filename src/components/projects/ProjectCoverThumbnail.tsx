"use client";

import Image from "next/image";
import { cn } from "@/lib/utils";

const SIZE_CLASS = {
  sm: "size-10 rounded-md",
  md: "size-14 rounded-lg",
  lg: "size-20 rounded-xl sm:size-24",
} as const;

type ProjectCoverThumbnailProps = {
  url?: string | null;
  alt: string;
  size?: keyof typeof SIZE_CLASS;
  className?: string;
};

/** Mobile parity: projects.coverImageUrl from Firestore (read-only on web for now). */
export function ProjectCoverThumbnail({
  url,
  alt,
  size = "md",
  className,
}: ProjectCoverThumbnailProps) {
  const src = url?.trim();
  if (!src) return null;

  return (
    <div
      className={cn(
        "relative shrink-0 overflow-hidden border border-[var(--po-card-border)] bg-muted",
        SIZE_CLASS[size],
        className
      )}
    >
      <Image
        src={src}
        alt={alt}
        fill
        className="object-cover"
        sizes={size === "lg" ? "96px" : size === "md" ? "56px" : "40px"}
        unoptimized
      />
    </div>
  );
}
