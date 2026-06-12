"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Clock, ExternalLink, EyeOff, FolderOpen, MapPin, User } from "lucide-react";
import type { OperationsDashboardData } from "@/services/operations/operationsDashboardService";
import type { ActiveTimerState } from "@/services/operations/teamLiveStatusService";
import {
  buildOperationsMapViewModel,
  buildWorkerMapMarkers,
  groupMembersByProject,
  memberMatchesMapFilter,
  type MapViewFilter,
  type MapViewGroupMode,
  type MapViewMember,
} from "@/services/operations/operationsMapViewService";
import {
  formatTimerHms,
  formatTimeShort,
  memberInitials,
  toHoursMinutes,
} from "@/lib/operationsMetrics";
import {
  entryGpsEndVisible,
  entryGpsFullyHidden,
  entryGpsStartVisible,
  googleMapsUrl,
} from "@/lib/operationsGps";
import type { HideGpsPart } from "@/services/attendance/timeEntryGpsModerationService";
import { Button, buttonVariants } from "@/components/ui/button";
import { OperationsLocationMap } from "./OperationsLocationMap";
import { cn } from "@/lib/utils";
import styles from "./operations.module.css";

type Props = {
  data: OperationsDashboardData;
  liveTimers: Map<string, ActiveTimerState>;
  t: (key: string, params?: Record<string, string | number>) => string;
  canModerateGps?: boolean;
  onRequestHideGps?: (input: { entryId: string; part: HideGpsPart }) => void;
};

const STATUS_RING: Record<MapViewMember["status"], string> = {
  working: styles.opsBubbleRingWorking,
  paused: styles.opsBubbleRingPaused,
  absent: styles.opsBubbleRingAbsent,
  not_started: styles.opsBubbleRingIdle,
  offline: styles.opsBubbleRingOffline,
};

const STATUS_BADGE: Record<MapViewMember["status"], string> = {
  working: styles.opsStatusBadgeWorking,
  paused: styles.opsStatusBadgePaused,
  absent: styles.opsStatusBadgeAbsent,
  not_started: styles.opsStatusBadgeIdle,
  offline: styles.opsStatusBadgeOffline,
};

function liveTimerSeconds(member: MapViewMember, tick: number): number | undefined {
  if (member.status === "working" && typeof member.timerSeconds === "number") {
    return member.timerSeconds + tick;
  }
  return member.timerSeconds;
}

function gpsLocationLabel(m: MapViewMember, t: Props["t"]): string {
  if (m.hasLiveGps) return t("operations.mapView.locationAvailable");
  if (m.status === "working" || m.status === "paused") return t("operations.mapView.locationAfterStop");
  if (m.hasCompletedGps) return t("operations.mapView.locationAvailable");
  return t("operations.mapView.noLocation");
}

function bestGpsPoint(member: MapViewMember) {
  return member.liveGpsStart ?? member.completedGpsEnd ?? member.completedGpsStart;
}

function WorkerCard({
  member,
  selected,
  tick,
  onSelect,
  t,
}: {
  member: MapViewMember;
  selected: boolean;
  tick: number;
  onSelect: (uid: string) => void;
  t: Props["t"];
}) {
  const liveSecs = liveTimerSeconds(member, tick);
  const gpsPoint = bestGpsPoint(member);
  const showTimer =
    typeof liveSecs === "number" && (member.status === "working" || member.status === "paused");

  return (
    <article
      className={cn(
        styles.opsWorkerCard,
        STATUS_RING[member.status],
        selected && styles.opsWorkerCardSelected
      )}
    >
      <button
        type="button"
        onClick={() => onSelect(member.uid)}
        className={styles.opsWorkerCardMain}
      >
        <div className={styles.opsWorkerCardAvatar}>{memberInitials(member.name)}</div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className={styles.opsWorkerCardName}>{member.name}</h3>
            <span className={cn(styles.opsStatusBadge, STATUS_BADGE[member.status])}>
              {t(`operations.status.${member.status}`)}
            </span>
          </div>

          <div className={styles.opsWorkerCardRow}>
            <span className={styles.opsWorkerCardLabel}>{t("operations.presence.project")}</span>
            <span className={styles.opsWorkerCardValue}>
              {member.currentProject ?? t("operations.mapView.noProject")}
            </span>
          </div>

          <div className={styles.opsWorkerCardRow}>
            <span className={styles.opsWorkerCardLabel}>{t("operations.mapView.currentTask")}</span>
            <span className={cn(styles.opsWorkerCardValue, "text-muted-foreground")}>
              {member.currentTask ?? t("operations.mapView.noTask")}
            </span>
          </div>

          {showTimer ? (
            <div className={styles.opsWorkerCardTimerRow}>
              <span className={styles.opsWorkerCardLabel}>{t("operations.presence.timer")}</span>
              <span
                className={cn(
                  styles.opsWorkerCardTimer,
                  member.status === "paused" ? "text-amber-600" : "text-emerald-600"
                )}
              >
                {formatTimerHms(liveSecs)}
              </span>
            </div>
          ) : null}

          <div className={styles.opsWorkerCardRow}>
            <span className={styles.opsWorkerCardLabel}>{t("operations.mapView.todayWorked")}</span>
            <span className={styles.opsWorkerCardValue}>{toHoursMinutes(member.todayMinutes)}</span>
          </div>

          <span
            className={cn(
              styles.opsLocationChip,
              member.hasLiveGps || member.hasCompletedGps
                ? styles.opsLocationChipOk
                : styles.opsLocationChipMuted
            )}
          >
            {gpsLocationLabel(member, t)}
          </span>

          <span className={styles.opsWorkerHoverHint}>{t("operations.mapView.openDetail")}</span>
        </div>
      </button>

      <div className={styles.opsWorkerCardActions}>
        <Button type="button" size="sm" variant="secondary" onClick={() => onSelect(member.uid)}>
          {t("operations.mapView.openDetail")}
        </Button>
        {member.currentProjectId ? (
          <Link
            href={`/app/projects/${member.currentProjectId}`}
            className={cn(buttonVariants({ size: "sm", variant: "outline" }), "gap-1")}
          >
            <FolderOpen className="size-3.5" aria-hidden />
            {t("operations.mapView.openProject")}
          </Link>
        ) : (
          <Button size="sm" variant="outline" disabled>
            <FolderOpen className="size-3.5" aria-hidden />
            {t("operations.mapView.openProject")}
          </Button>
        )}
        <Link
          href="/app/attendance"
          className={cn(buttonVariants({ size: "sm", variant: "outline" }), "gap-1")}
        >
          <Clock className="size-3.5" aria-hidden />
          {t("operations.mapView.openTimeTracking")}
        </Link>
        {gpsPoint ? (
          <Link
            href={googleMapsUrl(gpsPoint.lat, gpsPoint.lng)}
            target="_blank"
            rel="noopener noreferrer"
            className={cn(buttonVariants({ size: "sm", variant: "outline" }), "gap-1")}
          >
            <MapPin className="size-3.5" aria-hidden />
            {t("operations.mapView.openInMaps")}
          </Link>
        ) : null}
      </div>
    </article>
  );
}

function WorkerDetailPanel({
  member,
  tick,
  t,
  canModerateGps,
  onRequestHideGps,
}: {
  member: MapViewMember;
  tick: number;
  t: Props["t"];
  canModerateGps?: boolean;
  onRequestHideGps?: (input: { entryId: string; part: HideGpsPart }) => void;
}) {
  const liveSecs = liveTimerSeconds(member, tick);
  const entry = member.lastTimeEntry;
  const gpsPoint = bestGpsPoint(member);
  const showGps = Boolean(gpsPoint);
  const fullyHidden = entry ? entryGpsFullyHidden(entry) : false;
  const visibleStart = entry ? entryGpsStartVisible(entry) : null;
  const visibleEnd = entry ? entryGpsEndVisible(entry) : null;

  return (
    <section className={styles.opsDetailPanelProminent}>
      <p className={styles.opsDetailEyebrow}>{t("operations.mapView.selectedWorker")}</p>

      <div className={styles.opsDetailHeader}>
        <div className={styles.opsDetailAvatar}>{memberInitials(member.name)}</div>
        <div className="min-w-0">
          <h3 className={styles.opsDetailTitle}>{member.name}</h3>
          <span className={cn(styles.opsStatusBadge, STATUS_BADGE[member.status], "mt-1")}>
            {t(`operations.status.${member.status}`)}
          </span>
        </div>
      </div>

      <div className={styles.opsDetailCards}>
        <div className={styles.opsDetailCard}>
          <p className={styles.opsDetailCardLabel}>{t("operations.presence.project")}</p>
          <p className={styles.opsDetailCardValue}>
            {member.currentProjectId ? (
              <Link
                href={`/app/projects/${member.currentProjectId}`}
                className="font-semibold text-[#1D376A] hover:underline dark:text-slate-100"
              >
                {member.currentProject}
              </Link>
            ) : (
              t("operations.mapView.noProject")
            )}
          </p>
        </div>

        <div className={styles.opsDetailCard}>
          <p className={styles.opsDetailCardLabel}>{t("operations.mapView.currentTask")}</p>
          <p className={styles.opsDetailCardValue}>
            {member.currentTask ?? t("operations.mapView.noTask")}
          </p>
        </div>

        {typeof liveSecs === "number" ? (
          <div className={styles.opsDetailCard}>
            <p className={styles.opsDetailCardLabel}>{t("operations.presence.timer")}</p>
            <p className={cn(styles.opsDetailCardValue, "text-2xl font-extrabold tabular-nums text-emerald-600")}>
              {formatTimerHms(liveSecs)}
            </p>
          </div>
        ) : null}

        <div className={styles.opsDetailCard}>
          <p className={styles.opsDetailCardLabel}>{t("operations.mapView.todayWorked")}</p>
          <p className={styles.opsDetailCardValue}>{toHoursMinutes(member.todayMinutes)}</p>
        </div>

        {member.startedAt ? (
          <div className={styles.opsDetailCard}>
            <p className={styles.opsDetailCardLabel}>{t("operations.presence.since")}</p>
            <p className={styles.opsDetailCardValue}>{formatTimeShort(member.startedAt)}</p>
          </div>
        ) : null}

        {member.pauseSince ? (
          <div className={styles.opsDetailCard}>
            <p className={styles.opsDetailCardLabel}>{t("operations.presence.pauseSince")}</p>
            <p className={styles.opsDetailCardValue}>{formatTimeShort(member.pauseSince)}</p>
          </div>
        ) : null}
      </div>

      <div className={styles.opsDetailGpsSection}>
        <h4 className={styles.opsDetailSectionTitle}>{t("operations.mapView.lastWorkPosition")}</h4>
        {fullyHidden ? (
          <p className="text-sm font-medium text-muted-foreground">{t("operations.gps.hidden")}</p>
        ) : showGps && gpsPoint ? (
          <>
            {member.hasLiveGps && member.liveGpsStart ? (
              <div className={styles.opsDetailGpsCard}>
                <p className="font-semibold text-foreground">{t("operations.mapView.locationAvailable")}</p>
                <p className="mt-1 text-xs tabular-nums text-muted-foreground">
                  {member.liveGpsStart.lat.toFixed(5)}, {member.liveGpsStart.lng.toFixed(5)}
                  {member.liveGpsStart.accuracyM != null
                    ? ` · ±${Math.round(member.liveGpsStart.accuracyM)} m`
                    : ""}
                </p>
              </div>
            ) : null}
            {visibleStart && entry ? (
              <div className={cn(styles.opsDetailGpsCard, "mt-2")}>
                <p className="font-semibold text-foreground">
                  {t("operations.map.entryStart")}
                  {entry.startedAt ? ` · ${formatTimeShort(entry.startedAt)}` : ""}
                </p>
                <p className="mt-1 text-xs tabular-nums text-muted-foreground">
                  {visibleStart.lat.toFixed(5)}, {visibleStart.lng.toFixed(5)}
                </p>
                <div className="mt-2 flex flex-wrap gap-2">
                  <Link
                    href={googleMapsUrl(visibleStart.lat, visibleStart.lng)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={cn(buttonVariants({ size: "sm", variant: "outline" }), "gap-1")}
                  >
                    <ExternalLink className="size-3.5" aria-hidden />
                    {t("operations.mapView.openInMaps")}
                  </Link>
                  {canModerateGps && onRequestHideGps ? (
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      className="gap-1"
                      onClick={() => onRequestHideGps({ entryId: entry.id, part: "start" })}
                    >
                      <EyeOff className="size-3.5" aria-hidden />
                      {t("operations.gps.hideLocation")}
                    </Button>
                  ) : null}
                </div>
              </div>
            ) : null}
            {visibleEnd && entry ? (
              <div className={cn(styles.opsDetailGpsCard, "mt-2")}>
                <p className="font-semibold text-foreground">
                  {t("operations.map.entryEnd")}
                  {entry.endedAt ? ` · ${formatTimeShort(entry.endedAt)}` : ""}
                </p>
                <p className="mt-1 text-xs tabular-nums text-muted-foreground">
                  {visibleEnd.lat.toFixed(5)}, {visibleEnd.lng.toFixed(5)}
                </p>
                <div className="mt-2 flex flex-wrap gap-2">
                  <Link
                    href={googleMapsUrl(visibleEnd.lat, visibleEnd.lng)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={cn(buttonVariants({ size: "sm", variant: "outline" }), "gap-1")}
                  >
                    <ExternalLink className="size-3.5" aria-hidden />
                    {t("operations.mapView.openInMaps")}
                  </Link>
                  {canModerateGps && onRequestHideGps ? (
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      className="gap-1"
                      onClick={() => onRequestHideGps({ entryId: entry.id, part: "end" })}
                    >
                      <EyeOff className="size-3.5" aria-hidden />
                      {t("operations.gps.hideLocation")}
                    </Button>
                  ) : null}
                </div>
              </div>
            ) : null}
          </>
        ) : (
          <p className="text-sm text-muted-foreground">{t("operations.mapView.noLocation")}</p>
        )}
        {(member.status === "working" || member.status === "paused") && !member.hasLiveGps ? (
          <p className="mt-2 text-xs text-sky-700 dark:text-sky-400">
            {t("operations.mapView.locationAfterStop")}
          </p>
        ) : null}
      </div>

      <div className={styles.opsDetailActions}>
        {member.currentProjectId ? (
          <Link
            href={`/app/projects/${member.currentProjectId}`}
            className={cn(buttonVariants({ size: "sm" }), "gap-1")}
          >
            <FolderOpen className="size-4" aria-hidden />
            {t("operations.mapView.openProject")}
          </Link>
        ) : (
          <Button size="sm" disabled>
            <FolderOpen className="size-4" aria-hidden />
            {t("operations.mapView.openProject")}
          </Button>
        )}
        <Link
          href="/app/attendance"
          className={cn(buttonVariants({ size: "sm", variant: "outline" }), "gap-1")}
        >
          <Clock className="size-4" aria-hidden />
          {t("operations.mapView.openTimeTracking")}
        </Link>
        {gpsPoint ? (
          <Link
            href={googleMapsUrl(gpsPoint.lat, gpsPoint.lng)}
            target="_blank"
            rel="noopener noreferrer"
            className={cn(buttonVariants({ size: "sm", variant: "outline" }), "gap-1")}
          >
            <ExternalLink className="size-4" aria-hidden />
            {t("operations.mapView.openInMaps")}
          </Link>
        ) : null}
      </div>

      <p className="mt-4 text-[11px] leading-relaxed text-muted-foreground">
        {t("operations.mapView.locationPrivacyNote")}
      </p>
    </section>
  );
}

function MapEmptyState({ t }: { t: Props["t"] }) {
  return (
    <div className={styles.opsMapEmpty}>
      <MapPin className="mx-auto mb-3 size-12 text-muted-foreground/40" aria-hidden />
      <p className="text-base font-semibold text-foreground">{t("operations.mapView.noLocationData")}</p>
      <p className="mt-2 max-w-sm text-sm text-muted-foreground">{t("operations.mapView.noLocationHint")}</p>
    </div>
  );
}

export function OperationsMapView({
  data,
  liveTimers,
  t,
  canModerateGps = false,
  onRequestHideGps,
}: Props) {
  const model = useMemo(
    () => buildOperationsMapViewModel({ data, liveTimers }),
    [data, liveTimers]
  );
  const [filter, setFilter] = useState<MapViewFilter>("all");
  const [groupMode, setGroupMode] = useState<MapViewGroupMode>("project");
  const [selectedUid, setSelectedUid] = useState<string | null>(null);
  const [tick, setTick] = useState(0);

  const filtered = useMemo(
    () => model.members.filter((m) => memberMatchesMapFilter(m, filter)),
    [model.members, filter]
  );

  const workerMarkers = useMemo(() => buildWorkerMapMarkers(filtered), [filtered]);

  const selectedMember = useMemo(
    () => model.members.find((m) => m.uid === selectedUid) ?? null,
    [model.members, selectedUid]
  );

  useEffect(() => {
    const hasLive = model.members.some((m) => m.status === "working");
    if (!hasLive) return;
    const id = setInterval(() => setTick((n) => n + 1), 1000);
    return () => clearInterval(id);
  }, [model.members]);

  const filters: { id: MapViewFilter; labelKey: string }[] = [
    { id: "all", labelKey: "operations.presence.filter.all" },
    { id: "working", labelKey: "operations.presence.filter.working" },
    { id: "paused", labelKey: "operations.presence.filter.paused" },
    { id: "not_started", labelKey: "operations.presence.filter.notStarted" },
    { id: "absent", labelKey: "operations.presence.filter.absent" },
    { id: "with_gps", labelKey: "operations.mapView.withGps" },
    { id: "without_gps", labelKey: "operations.mapView.withoutGps" },
  ];

  const groups =
    groupMode === "project"
      ? groupMembersByProject(filtered, model.projects, t("operations.mapView.groupWithoutProject"))
      : [{ key: "all", label: t("operations.mapView.groupByEmployee"), items: filtered }];

  return (
    <div className={styles.opsMapViewShell}>
      <div className={styles.opsMapViewHeader}>
        <div>
          <h2 className={styles.sectionTitle}>{t("operations.mapView.title")}</h2>
          <p className="mt-1 text-sm text-muted-foreground">{t("operations.mapView.subtitle")}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {filters.map((f) => (
            <button
              key={f.id}
              type="button"
              onClick={() => setFilter(f.id)}
              className={cn(
                "rounded-lg px-2.5 py-1 text-xs font-semibold transition-colors",
                filter === f.id
                  ? "bg-[#1D376A] text-white"
                  : "bg-muted text-muted-foreground hover:bg-muted/80"
              )}
            >
              {t(f.labelKey)}
            </button>
          ))}
        </div>
      </div>

      <p className={styles.opsWhoIsWhere}>{t("operations.mapView.whoIsWhere")}</p>

      <div className={styles.opsMapViewGrid}>
        <aside className={styles.opsBubbleColumn}>
          <div className="mb-3 inline-flex rounded-lg border border-border p-0.5">
            {(
              [
                { id: "employee" as const, labelKey: "operations.mapView.groupByEmployee" },
                { id: "project" as const, labelKey: "operations.mapView.groupByProject" },
              ] as const
            ).map((g) => (
              <button
                key={g.id}
                type="button"
                onClick={() => setGroupMode(g.id)}
                className={cn(
                  "rounded-md px-2.5 py-1 text-xs font-semibold",
                  groupMode === g.id ? "bg-[#e06737] text-white" : "text-muted-foreground"
                )}
              >
                {t(g.labelKey)}
              </button>
            ))}
          </div>

          {selectedMember ? (
            <WorkerDetailPanel
              member={selectedMember}
              tick={tick}
              t={t}
              canModerateGps={canModerateGps}
              onRequestHideGps={onRequestHideGps}
            />
          ) : null}

          <div className="space-y-5">
            {groups.map((group) => (
              <div key={group.key}>
                {groupMode === "project" ? (
                  <h3 className={styles.opsProjectGroupTitle}>
                    <User className="size-4 shrink-0 opacity-60" aria-hidden />
                    {group.label}
                    <span className="ml-auto text-xs font-semibold text-muted-foreground">
                      {group.items.length}
                    </span>
                  </h3>
                ) : null}
                <div className="space-y-3">
                  {group.items.map((m) => (
                    <WorkerCard
                      key={m.uid}
                      member={m}
                      selected={selectedUid === m.uid}
                      tick={tick}
                      onSelect={setSelectedUid}
                      t={t}
                    />
                  ))}
                </div>
              </div>
            ))}
            {filtered.length === 0 ? (
              <p className="py-6 text-center text-sm text-muted-foreground">
                {t("operations.presence.empty")}
              </p>
            ) : null}
          </div>
        </aside>

        <main className={styles.opsMapMain}>
          {workerMarkers.length > 0 ? (
            <OperationsLocationMap
              workerMarkers={workerMarkers}
              selectedUid={selectedUid}
              onSelectUid={setSelectedUid}
              t={t}
              canModerateGps={canModerateGps}
              onRequestHideGps={onRequestHideGps}
            />
          ) : (
            <MapEmptyState t={t} />
          )}
        </main>
      </div>
    </div>
  );
}
