"use client";

import Link from "next/link";
import { Truck, Users } from "lucide-react";
import { useI18n } from "@/i18n/I18nContext";
import { cn } from "@/lib/utils";
import type { OpsResource } from "./opsModel";
import { opsCardClassName, opsToneBadgeClassName } from "./opsStyles";

type CapacityCardProps = {
  team: OpsResource[];
  vehicles: OpsResource[];
  workersAvailable: number;
  vehiclesAvailable: number;
};

function CompactRow({ resource }: { resource: OpsResource }) {
  const { t } = useI18n();
  return (
    <li className="flex items-center justify-between gap-2 py-1.5">
      <span className="min-w-0 truncate text-sm text-foreground">{resource.name}</span>
      <span
        className={cn(
          "shrink-0 rounded-md px-2 py-0.5 text-[10px] font-medium",
          opsToneBadgeClassName[resource.tone]
        )}
      >
        {t(resource.statusKey)}
      </span>
    </li>
  );
}

export function CapacityCard({
  team,
  vehicles,
  workersAvailable,
  vehiclesAvailable,
}: CapacityCardProps) {
  const { t } = useI18n();

  return (
    <section className={cn(opsCardClassName, "p-5")}>
      <h2 className="text-base font-semibold tracking-tight text-foreground">
        {t("dashboard.ops.capacity.title")}
      </h2>
      <p className="mb-4 mt-0.5 text-xs text-muted-foreground">
        {t("dashboard.ops.capacity.summary", {
          workers: workersAvailable,
          vehicles: vehiclesAvailable,
        })}
      </p>

      <div className="mb-2 flex items-center gap-2 text-muted-foreground">
        <Users className="size-3.5" aria-hidden />
        <span className="text-xs font-medium">{t("dashboard.ops.capacity.team")}</span>
      </div>
      {team.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t("dashboard.ops.capacity.teamEmpty")}</p>
      ) : (
        <ul role="list">
          {team.slice(0, 4).map((m) => (
            <CompactRow key={m.id} resource={m} />
          ))}
        </ul>
      )}

      <div className="mb-2 mt-4 flex items-center gap-2 text-muted-foreground">
        <Truck className="size-3.5" aria-hidden />
        <span className="text-xs font-medium">{t("dashboard.ops.capacity.vehicles")}</span>
      </div>
      {vehicles.length === 0 ? (
        <Link href="/app/equipment/new" className="text-xs font-medium text-primary hover:underline">
          {t("dashboard.ops.capacity.vehiclesEmpty")}
        </Link>
      ) : (
        <ul role="list">
          {vehicles.slice(0, 4).map((v) => (
            <CompactRow key={v.id} resource={v} />
          ))}
        </ul>
      )}
    </section>
  );
}
