import type { GpsPoint, TimeEntryDoc } from "@/services/attendance/timeTrackingReadService";

export type GpsDisplayStatus = "available" | "after_stop" | "none" | "low_accuracy";

export const GPS_LOW_ACCURACY_THRESHOLD_M = 50;

export type ParsedGpsPoint = {
  lat: number;
  lng: number;
  accuracyM?: number;
};

export function parseGpsPoint(raw: unknown): ParsedGpsPoint | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const p = raw as Record<string, unknown>;
  const lat = typeof p.lat === "number" ? p.lat : undefined;
  const lng = typeof p.lng === "number" ? p.lng : undefined;
  if (lat === undefined || lng === undefined) return null;
  const accuracyM =
    typeof p.accuracyM === "number"
      ? p.accuracyM
      : typeof p.accuracy === "number"
        ? p.accuracy
        : undefined;
  return { lat, lng, accuracyM };
}

export function isLowAccuracyGps(point: ParsedGpsPoint | null | undefined): boolean {
  return (
    typeof point?.accuracyM === "number" && point.accuracyM > GPS_LOW_ACCURACY_THRESHOLD_M
  );
}

export function googleMapsUrl(lat: number, lng: number): string {
  return `https://www.google.com/maps?q=${lat},${lng}`;
}

export function entryGpsStartVisible(entry: TimeEntryDoc): ParsedGpsPoint | null {
  if (entry.gpsStartHidden) return null;
  return parseGpsPoint(entry.gpsStart);
}

export function entryGpsEndVisible(entry: TimeEntryDoc): ParsedGpsPoint | null {
  if (entry.gpsEndHidden) return null;
  return parseGpsPoint(entry.gpsEnd);
}

export function entryHasVisibleGps(entry: TimeEntryDoc): boolean {
  return Boolean(entryGpsStartVisible(entry) ?? entryGpsEndVisible(entry));
}

export function entryGpsFullyHidden(entry: TimeEntryDoc): boolean {
  const rawStart = parseGpsPoint(entry.gpsStart);
  const rawEnd = parseGpsPoint(entry.gpsEnd);
  if (!rawStart && !rawEnd) return false;
  const startOk = rawStart ? entry.gpsStartHidden === true : true;
  const endOk = rawEnd ? entry.gpsEndHidden === true : true;
  return startOk && endOk;
}

/** @deprecated Use entryHasVisibleGps — respects manager-hidden GPS. */
export function entryHasGps(entry: TimeEntryDoc): boolean {
  return entryHasVisibleGps(entry);
}

export function resolveMemberGpsStatus(input: {
  status: "working" | "paused" | "offline" | "not_started" | "absent";
  liveGpsStart: ParsedGpsPoint | null;
  todayEntriesForUser: TimeEntryDoc[];
}): GpsDisplayStatus {
  if (input.status === "absent" || input.status === "not_started") {
    return "none";
  }

  if (input.liveGpsStart) {
    return isLowAccuracyGps(input.liveGpsStart) ? "low_accuracy" : "available";
  }

  if (input.status === "working" || input.status === "paused") {
    return "after_stop";
  }

  let hasGps = false;
  let lowAccuracy = false;
  for (const entry of input.todayEntriesForUser) {
    const start = entryGpsStartVisible(entry);
    const end = entryGpsEndVisible(entry);
    if (!start && !end) continue;
    hasGps = true;
    if (
      entry.flags?.lowAccuracy ||
      isLowAccuracyGps(start) ||
      isLowAccuracyGps(end)
    ) {
      lowAccuracy = true;
    }
  }

  if (!hasGps) return "none";
  return lowAccuracy ? "low_accuracy" : "available";
}

export function normalizeGpsPoint(raw: GpsPoint | null | undefined): ParsedGpsPoint | null {
  return parseGpsPoint(raw);
}
