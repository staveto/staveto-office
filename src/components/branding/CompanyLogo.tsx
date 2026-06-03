"use client";

import { Building2 } from "lucide-react";
import { cn } from "@/lib/utils";

const SIZE_CLASS = {
  xs: "size-8",
  sm: "size-9",
  md: "size-12",
  lg: "size-16",
  hero: "size-20 sm:size-24",
} as const;

type CompanyLogoProps = {
  logoUrl?: string | null;
  alt?: string;
  size?: keyof typeof SIZE_CLASS;
  className?: string;
  imageClassName?: string;
  /** Dark sidebar — white/light frame around logo */
  variant?: "default" | "sidebar";
};

export function CompanyLogo({
  logoUrl,
  alt = "",
  size = "md",
  className,
  imageClassName,
  variant = "default",
}: CompanyLogoProps) {
  const frameClass =
    variant === "sidebar"
      ? "border border-white/15 bg-white/95"
      : "border border-[#1D376A]/10 bg-white shadow-sm";

  if (logoUrl) {
    return (
      <div
        className={cn(
          "flex shrink-0 items-center justify-center overflow-hidden rounded-lg",
          frameClass,
          SIZE_CLASS[size],
          className
        )}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={logoUrl}
          alt={alt}
          className={cn("size-full object-contain p-1", imageClassName)}
        />
      </div>
    );
  }

  return (
    <div
      className={cn(
        "flex shrink-0 items-center justify-center rounded-lg",
        variant === "sidebar"
          ? "bg-white/10 text-white/70"
          : "bg-[#1D376A]/8 text-[#1D376A]/60",
        SIZE_CLASS[size],
        className
      )}
      aria-hidden={!alt}
    >
      <Building2 className={cn(size === "xs" || size === "sm" ? "size-4" : "size-6")} />
    </div>
  );
}
