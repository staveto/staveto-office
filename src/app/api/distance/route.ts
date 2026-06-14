import { NextRequest, NextResponse } from "next/server";

/**
 * Server-side driving-distance lookup via the Google Maps Directions API.
 *
 * The API key stays on the server (`GOOGLE_MAPS_API_KEY` — NOT a NEXT_PUBLIC_*
 * variable) so it is never shipped in the browser bundle. The mobile app uses
 * the same Directions API; this mirrors it for the web without exposing the key.
 *
 * Setup: add `GOOGLE_MAPS_API_KEY=...` to `.env.local` and enable the
 * "Directions API" in Google Cloud Console (billing must be enabled).
 */

const MIN_ADDRESS_LENGTH = 3;

function getApiKey(): string | null {
  return process.env.GOOGLE_MAPS_API_KEY?.trim() || null;
}

/** Feature availability probe for App Center (no secrets exposed). */
export async function GET() {
  return NextResponse.json({
    configured: !!getApiKey(),
    aiInvoiceOcr: true,
  });
}

type DirectionsResponse = {
  status?: string;
  error_message?: string;
  routes?: Array<{
    legs?: Array<{
      distance?: { value?: number };
      duration?: { value?: number };
    }>;
  }>;
};

export async function POST(request: NextRequest) {
  const apiKey = getApiKey();
  if (!apiKey) {
    return NextResponse.json({ errorCode: "MAPS_KEY_MISSING" }, { status: 503 });
  }

  let body: { fromAddress?: unknown; toAddress?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ errorCode: "BAD_REQUEST" }, { status: 400 });
  }

  const from = typeof body.fromAddress === "string" ? body.fromAddress.trim() : "";
  const to = typeof body.toAddress === "string" ? body.toAddress.trim() : "";
  if (from.length < MIN_ADDRESS_LENGTH || to.length < MIN_ADDRESS_LENGTH) {
    return NextResponse.json({ errorCode: "INVALID_ADDRESS" }, { status: 400 });
  }

  const url =
    `https://maps.googleapis.com/maps/api/directions/json` +
    `?origin=${encodeURIComponent(from)}` +
    `&destination=${encodeURIComponent(to)}` +
    `&mode=driving&key=${apiKey}`;

  let data: DirectionsResponse;
  try {
    const res = await fetch(url);
    if (!res.ok) {
      return NextResponse.json({ errorCode: "NETWORK", status: res.status }, { status: 502 });
    }
    data = (await res.json()) as DirectionsResponse;
  } catch (err) {
    const e = err as { message?: string; cause?: { code?: string; message?: string } };
    console.error(
      "[/api/distance] fetch failed",
      "extraCa=", process.env.NODE_EXTRA_CA_CERTS ?? "(unset)",
      "err=", e?.message,
      "cause=", e?.cause?.code, e?.cause?.message
    );
    return NextResponse.json({ errorCode: "NETWORK" }, { status: 502 });
  }

  const status = data.status ?? "UNKNOWN";
  if (status === "ZERO_RESULTS" || status === "NOT_FOUND") {
    return NextResponse.json({ errorCode: "ADDRESS_NOT_FOUND" }, { status: 422 });
  }
  if (status === "REQUEST_DENIED") {
    return NextResponse.json(
      { errorCode: "REQUEST_DENIED", message: data.error_message ?? null },
      { status: 403 }
    );
  }
  if (status === "OVER_QUERY_LIMIT") {
    return NextResponse.json({ errorCode: "QUOTA" }, { status: 429 });
  }
  if (status !== "OK") {
    return NextResponse.json(
      { errorCode: "DIRECTIONS_FAILED", message: data.error_message ?? status },
      { status: 502 }
    );
  }

  const leg = data.routes?.[0]?.legs?.[0];
  const meters = leg?.distance?.value;
  if (typeof meters !== "number" || meters < 0) {
    return NextResponse.json({ errorCode: "DIRECTIONS_FAILED" }, { status: 502 });
  }

  const distanceKm = Math.round((meters / 1000) * 10) / 10;
  const durationSec = leg?.duration?.value;
  const durationMin =
    typeof durationSec === "number" ? Math.round(durationSec / 60) : undefined;

  return NextResponse.json({ distanceKm, durationMin });
}
