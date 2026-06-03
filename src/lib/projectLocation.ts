import type { ProjectDoc } from "./projects";

export type ProjectCoordinates = {
  lat: number;
  lng: number;
};

const geocodeCache = new Map<string, ProjectCoordinates | null>();
let geocodeQueue: Promise<void> = Promise.resolve();
let lastGeocodeAt = 0;

const NOMINATIM_MIN_INTERVAL_MS = 1100;

function readNumber(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return undefined;
}

/** Read stored coordinates from project document (optional mobile / future fields). */
export function getProjectStoredCoordinates(
  project: ProjectDoc
): ProjectCoordinates | null {
  const data = project as ProjectDoc & Record<string, unknown>;
  const location = data.location;
  const locationObj =
    location && typeof location === "object"
      ? (location as Record<string, unknown>)
      : null;

  const lat =
    readNumber(data.latitude) ??
    readNumber(data.lat) ??
    readNumber(locationObj?.latitude) ??
    readNumber(locationObj?.lat);
  const lng =
    readNumber(data.longitude) ??
    readNumber(data.lng) ??
    readNumber(locationObj?.longitude) ??
    readNumber(locationObj?.lng);

  if (lat === undefined || lng === undefined) return null;
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return null;
  return { lat, lng };
}

const COUNTRY_SUFFIX: Record<string, string> = {
  SK: "Slovakia",
  CZ: "Czechia",
  AT: "Austria",
  DE: "Germany",
  PL: "Poland",
  HU: "Hungary",
};

/** Build a geocodable address string from project location fields. */
export function formatProjectAddress(project: ProjectDoc): string | null {
  const parts = [project.addressText?.trim(), project.city?.trim()].filter(Boolean);
  if (parts.length === 0) return null;

  let address = parts.join(", ");
  const code = project.countryCode?.trim().toUpperCase();
  if (code && COUNTRY_SUFFIX[code]) {
    const suffix = COUNTRY_SUFFIX[code];
    if (!address.toLowerCase().includes(suffix.toLowerCase())) {
      address = `${address}, ${suffix}`;
    }
  }
  return address;
}

export function projectHasMapLocation(project: ProjectDoc): boolean {
  return !!getProjectStoredCoordinates(project) || !!formatProjectAddress(project);
}

function scheduleGeocode<T>(task: () => Promise<T>): Promise<T> {
  const run = geocodeQueue.then(async () => {
    const wait = NOMINATIM_MIN_INTERVAL_MS - (Date.now() - lastGeocodeAt);
    if (wait > 0) await new Promise((resolve) => setTimeout(resolve, wait));
    lastGeocodeAt = Date.now();
    return task();
  });
  geocodeQueue = run.then(
    () => undefined,
    () => undefined
  );
  return run;
}

/** Geocode address via OpenStreetMap Nominatim (cached, rate-limited). */
export async function geocodeProjectAddress(
  address: string
): Promise<ProjectCoordinates | null> {
  const key = address.trim().toLowerCase();
  if (!key) return null;
  if (geocodeCache.has(key)) return geocodeCache.get(key) ?? null;

  const coords = await scheduleGeocode(async () => {
    try {
      const url = new URL("https://nominatim.openstreetmap.org/search");
      url.searchParams.set("format", "json");
      url.searchParams.set("limit", "1");
      url.searchParams.set("q", address);

      const res = await fetch(url.toString(), {
        headers: {
          Accept: "application/json",
          "User-Agent": "StavetoOffice/1.0 (projects map view)",
        },
      });
      if (!res.ok) return null;

      const data = (await res.json()) as Array<{ lat?: string; lon?: string }>;
      const hit = data[0];
      if (!hit?.lat || !hit.lon) return null;

      const lat = Number(hit.lat);
      const lng = Number(hit.lon);
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
      return { lat, lng };
    } catch {
      return null;
    }
  });

  geocodeCache.set(key, coords);
  return coords;
}

export async function resolveProjectCoordinates(
  project: ProjectDoc
): Promise<ProjectCoordinates | null> {
  const stored = getProjectStoredCoordinates(project);
  if (stored) return stored;

  const address = formatProjectAddress(project);
  if (!address) return null;
  return geocodeProjectAddress(address);
}

export type ProjectMapMarker = {
  project: ProjectDoc;
  lat: number;
  lng: number;
  addressLabel: string;
};

export async function buildProjectMapMarkers(
  projects: ProjectDoc[]
): Promise<ProjectMapMarker[]> {
  const markers: ProjectMapMarker[] = [];

  for (const project of projects) {
    if (!projectHasMapLocation(project)) continue;
    const coords = await resolveProjectCoordinates(project);
    if (!coords) continue;

    markers.push({
      project,
      lat: coords.lat,
      lng: coords.lng,
      addressLabel:
        formatProjectAddress(project) ??
        [project.addressText, project.city].filter(Boolean).join(", "),
    });
  }

  return markers;
}
