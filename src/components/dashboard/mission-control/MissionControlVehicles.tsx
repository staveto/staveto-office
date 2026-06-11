"use client";

import Link from "next/link";
import type { VehicleRow } from "@/lib/missionControlData";
import { useI18n } from "@/i18n/I18nContext";
import {
  missionGlassCardClassName,
  missionMutedClassName,
  missionSectionTitleClassName,
  missionStatusToneClassName,
} from "./missionControlStyles";
import { cn } from "@/lib/utils";

type MissionControlVehiclesProps = {
  vehicles: VehicleRow[];
};

const VEHICLE_TONE: Record<string, keyof typeof missionStatusToneClassName> = {
  "dashboard.mission.vehicle.onSite": "on_site",
  "dashboard.mission.vehicle.free": "free",
  "dashboard.mission.vehicle.service": "service",
};

export function MissionControlVehicles({ vehicles }: MissionControlVehiclesProps) {
  const { t } = useI18n();

  return (
    <section className={cn(missionGlassCardClassName, "p-4")}>
      <h3 className={cn(missionSectionTitleClassName, "mb-3")}>
        {t("dashboard.mission.vehicles.title")}
      </h3>

      {vehicles.length === 0 ? (
        <Link href="/app/equipment/new" className="text-xs font-medium text-primary hover:underline">
          {t("dashboard.mission.vehicles.add")}
        </Link>
      ) : (
        <ul className="divide-y divide-border" role="list">
          {vehicles.map((vehicle) => {
            const tone = VEHICLE_TONE[vehicle.statusKey] ?? "unknown";
            return (
              <li key={vehicle.id}>
                <Link
                  href={vehicle.href}
                  className={cn(
                    "flex items-center justify-between gap-2 py-2 first:pt-0 last:pb-0",
                    "transition-colors hover:opacity-80",
                    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
                  )}
                >
                  <span className="truncate text-sm font-medium text-foreground">{vehicle.name}</span>
                  <span
                    className={cn(
                      "shrink-0 rounded-md px-2 py-0.5 text-[10px] font-medium",
                      missionStatusToneClassName[tone]
                    )}
                  >
                    {t(vehicle.statusKey)}
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
