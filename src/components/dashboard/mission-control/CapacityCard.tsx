"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Truck, Users } from "lucide-react";
import { useI18n } from "@/i18n/I18nContext";
import { formatTimerHms } from "@/lib/operationsMetrics";
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
  const [tick, setTick] = useState(0);
  const isLive = resource.liveStatus === "working" || resource.liveStatus === "paused";

  useEffect(() => {
    if (resource.liveStatus !== "working") return;
    const id = setInterval(() => setTick((n) => n + 1), 1000);
    return () => clearInterval(id);
  }, [resource.liveStatus]);

  void tick;

  const inner = (
    <>
      <div className="min-w-0 flex-1">
        <span className="block truncate text-sm font-medium text-foreground">{resource.name}</span>
        {resource.projectName ? (
          <span className="block truncate text-xs text-muted-foreground">{resource.projectName}</span>
        ) : null}
        {isLive && typeof resource.timerSeconds === "number" ? (
          <span className="mt-0.5 block font-mono text-xs font-semibold tabular-nums text-emerald-700 dark:text-emerald-300">
            {formatTimerHms(resource.timerSeconds)}
          </span>
        ) : null}
      </div>
      <span
        className={cn(
          "shrink-0 rounded-md px-2 py-0.5 text-[10px] font-medium",
          opsToneBadgeClassName[resource.tone]
        )}
      >
        {t(resource.statusKey)}
      </span>
    </>
  );

  if (resource.href && isLive) {
    return (
      <li>
        <Link
          href={resource.href}
          className={cn(
            "flex items-center justify-between gap-2 rounded-lg px-2 py-2 transition-colors hover:bg-muted/50",
            resource.liveStatus === "working" && "border border-emerald-500/30 bg-emerald-500/5"
          )}
        >
          {inner}
        </Link>
      </li>
    );
  }

  return (
    <li className="flex items-center justify-between gap-2 py-1.5">
      {inner}
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
        <ul role="list" className="space-y-0.5">
          {team.slice(0, 6).map((m) => (
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
