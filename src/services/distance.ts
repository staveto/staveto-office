/**
 * Travel distance calculation for the web app.
 *
 * Calls the internal `/api/distance` route (Next.js server handler), which talks
 * to the Google Maps Directions API using a server-side key. The key is never
 * exposed in the browser. This mirrors the mobile app's Directions-based
 * distance lookup.
 */

const MIN_ADDRESS_LENGTH = 3;

type DistanceApiResponse = {
  distanceKm?: number;
  durationMin?: number;
  errorCode?: string;
};

/**
 * Calculate the driving distance (in km) between two addresses.
 *
 * @throws Error with a coded message:
 * - `INVALID_ADDRESS` — addresses too short
 * - `MAPS_KEY_MISSING` — server has no Google Maps key configured
 * - `ADDRESS_NOT_FOUND` — Directions API could not resolve an address
 * - `DISTANCE_UNAVAILABLE` — endpoint unreachable
 * - `DISTANCE_FAILED` — other failure
 */
export async function calculateRouteDistanceKm(
  fromAddress: string,
  toAddress: string
): Promise<number> {
  const from = (fromAddress ?? "").trim();
  const to = (toAddress ?? "").trim();

  if (from.length < MIN_ADDRESS_LENGTH || to.length < MIN_ADDRESS_LENGTH) {
    throw new Error("INVALID_ADDRESS");
  }

  let res: Response;
  try {
    res = await fetch("/api/distance", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ fromAddress: from, toAddress: to }),
    });
  } catch {
    throw new Error("DISTANCE_UNAVAILABLE");
  }

  let data: DistanceApiResponse = {};
  try {
    data = (await res.json()) as DistanceApiResponse;
  } catch {
    // keep empty; handled below
  }

  if (!res.ok) {
    switch (data.errorCode) {
      case "MAPS_KEY_MISSING":
      case "REQUEST_DENIED":
        throw new Error("MAPS_KEY_MISSING");
      case "INVALID_ADDRESS":
        throw new Error("INVALID_ADDRESS");
      case "ADDRESS_NOT_FOUND":
        throw new Error("ADDRESS_NOT_FOUND");
      default:
        throw new Error("DISTANCE_FAILED");
    }
  }

  const distanceKm = data.distanceKm;
  if (typeof distanceKm !== "number" || !Number.isFinite(distanceKm) || distanceKm < 0) {
    throw new Error("DISTANCE_FAILED");
  }

  return Math.round(distanceKm * 10) / 10;
}
