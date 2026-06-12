"use client";

import { useMemo } from "react";
import Link from "next/link";
import { ExternalLink, EyeOff, MapPin } from "lucide-react";
import type { TimeEntryDoc } from "@/services/attendance/timeTrackingReadService";
import type { HideGpsPart } from "@/services/attendance/timeEntryGpsModerationService";
import {
  entryGpsEndVisible,
  entryGpsStartVisible,
  googleMapsUrl,
  type ParsedGpsPoint,
} from "@/lib/operationsGps";
import { formatTimeShort } from "@/lib/operationsMetrics";
import { Button } from "@/components/ui/button";
import styles from "./operations.module.css";

type Props = {
  todayEntries: TimeEntryDoc[];
  t: (key: string, params?: Record<string, string | number>) => string;
  canModerateGps?: boolean;
  onRequestHideGps?: (input: { entryId: string; part: HideGpsPart }) => void;
};

type LocationRow = {
  id: string;
  entryId: string;
  part: "start" | "end";
  userName: string;
  projectName: string;
  timeLabel: string;
  kind: "start" | "end";
  point: ParsedGpsPoint;
  lowAccuracy: boolean;
  sortMs: number;
};

function rowFromEntry(
  entry: TimeEntryDoc,
  kind: "start" | "end",
  point: ParsedGpsPoint,
  lowAccuracy: boolean
): LocationRow {
  const iso = kind === "start" ? entry.startedAt : entry.endedAt;
  return {
    id: `${entry.id}-${kind}`,
    entryId: entry.id,
    part: kind,
    userName: entry.userNameSnapshot || entry.userId,
    projectName: entry.projectNameSnapshot || entry.projectId,
    timeLabel: formatTimeShort(iso),
    kind,
    point,
    lowAccuracy,
    sortMs: iso ? new Date(iso).getTime() : 0,
  };
}

export function OperationsMapPanel({
  todayEntries,
  t,
  canModerateGps = false,
  onRequestHideGps,
}: Props) {
  const rows = useMemo(() => {
    const list: LocationRow[] = [];
    for (const entry of todayEntries) {
      if (entry.mode === "manual") continue;
      const start = entryGpsStartVisible(entry);
      const end = entryGpsEndVisible(entry);
      const entryLow = Boolean(entry.flags?.lowAccuracy);
      if (start) {
        list.push(
          rowFromEntry(
            entry,
            "start",
            start,
            entryLow || Boolean(start.accuracyM && start.accuracyM > 50)
          )
        );
      }
      if (end) {
        list.push(
          rowFromEntry(
            entry,
            "end",
            end,
            entryLow || Boolean(end.accuracyM && end.accuracyM > 50)
          )
        );
      }
    }
    return list.sort((a, b) => b.sortMs - a.sortMs);
  }, [todayEntries]);

  return (
    <section className={styles.sectionCard}>
      <p className={styles.sectionIntent}>{t("operations.layout.intent.locations")}</p>
      <div className="mb-3">
        <h2 className={styles.sectionTitle}>{t("operations.map.title")}</h2>
        <p className="mt-1 text-xs text-muted-foreground">{t("operations.map.subtitle")}</p>
      </div>

      {rows.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border bg-muted/30 px-4 py-10 text-center">
          <MapPin className="mx-auto mb-2 size-8 text-muted-foreground/50" aria-hidden />
          <p className="text-sm font-medium text-muted-foreground">{t("operations.map.emptyTitle")}</p>
          <p className="mt-1 text-xs text-muted-foreground">{t("operations.map.noGpsData")}</p>
        </div>
      ) : (
        <ul className="space-y-2">
          {rows.map((row) => (
            <li
              key={row.id}
              className="flex flex-col gap-2 rounded-xl border border-border bg-background px-3 py-2.5 sm:flex-row sm:items-center sm:justify-between"
            >
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-foreground">{row.userName}</p>
                <p className="truncate text-xs text-muted-foreground">
                  {row.projectName}
                  <span className="mx-1.5 text-border">·</span>
                  {row.timeLabel}
                  <span className="mx-1.5 text-border">·</span>
                  {row.kind === "start"
                    ? t("operations.map.entryStart")
                    : t("operations.map.entryEnd")}
                </p>
                {row.lowAccuracy ? (
                  <p className="mt-0.5 text-[10px] font-medium text-amber-700 dark:text-amber-400">
                    {t("operations.gps.lowAccuracy")}
                  </p>
                ) : null}
              </div>
              <div className="flex shrink-0 flex-wrap items-center gap-2">
                <Link
                  href={googleMapsUrl(row.point.lat, row.point.lng)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs font-semibold text-[#1D376A] hover:bg-muted dark:text-slate-100"
                >
                  {t("operations.map.openInMaps")}
                  <ExternalLink className="size-3" aria-hidden />
                </Link>
                {canModerateGps && onRequestHideGps ? (
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="h-8 gap-1 text-xs"
                    onClick={() => onRequestHideGps({ entryId: row.entryId, part: row.part })}
                  >
                    <EyeOff className="size-3.5" aria-hidden />
                    {t("operations.gps.hideLocation")}
                  </Button>
                ) : null}
              </div>
            </li>
          ))}
        </ul>
      )}

      <p className="mt-4 text-[11px] leading-relaxed text-muted-foreground">
        {t("operations.privacy.locationNote")}
      </p>
    </section>
  );
}
