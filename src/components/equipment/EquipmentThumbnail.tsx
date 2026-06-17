"use client";

import Image from "next/image";
import { Building2, Car, Cog, Package, Wrench } from "lucide-react";
import { cn } from "@/lib/utils";
import type { EquipmentCategory } from "@/services/equipment/types";

const CATEGORY_STYLES: Record<
  string,
  { icon: typeof Wrench; gradient: string; iconColor: string }
> = {
  vehicle: {
    icon: Car,
    gradient: "from-[#1D376A]/12 via-[#3B82F6]/10 to-[#1D376A]/8",
    iconColor: "text-[#1D376A]",
  },
  machine: {
    icon: Cog,
    gradient: "from-[#E06737]/14 via-[#F59E0B]/10 to-[#E06737]/8",
    iconColor: "text-[#E06737]",
  },
  tool: {
    icon: Wrench,
    gradient: "from-slate-200/80 via-slate-100 to-white",
    iconColor: "text-slate-600",
  },
  building: {
    icon: Building2,
    gradient: "from-emerald-100/80 via-emerald-50 to-white",
    iconColor: "text-emerald-700",
  },
  other: {
    icon: Package,
    gradient: "from-[#E2E8F0]/90 via-[#F8FAFC] to-white",
    iconColor: "text-[#64748B]",
  },
};

type EquipmentThumbnailProps = {
  name: string;
  category: string;
  photoUrl?: string;
  size?: "md" | "lg";
  className?: string;
};

export function EquipmentThumbnail({
  name,
  category,
  photoUrl,
  size = "md",
  className,
}: EquipmentThumbnailProps) {
  const style = CATEGORY_STYLES[category] ?? CATEGORY_STYLES.other;
  const Icon = style.icon;
  const dim = size === "lg" ? "size-24" : "size-[4.5rem]";

  return (
    <div
      className={cn(
        "relative shrink-0 overflow-hidden rounded-xl border border-[#E2E8F0] bg-[#F8FAFC] shadow-sm",
        "transition-transform duration-200 group-hover:scale-[1.02] group-hover:shadow-md",
        dim,
        className
      )}
    >
      {photoUrl ? (
        <Image
          src={photoUrl}
          alt=""
          fill
          className="object-cover transition-transform duration-300 group-hover:scale-105"
          sizes={size === "lg" ? "96px" : "72px"}
          unoptimized
        />
      ) : (
        <div
          className={cn(
            "flex h-full w-full items-center justify-center bg-gradient-to-br",
            style.gradient
          )}
          aria-hidden
        >
          <Icon className={cn("size-8", style.iconColor)} strokeWidth={1.75} />
        </div>
      )}
      <span className="sr-only">{name}</span>
    </div>
  );
}

export function equipmentCategoryIcon(category: EquipmentCategory | string) {
  return (CATEGORY_STYLES[category] ?? CATEGORY_STYLES.other).icon;
}
