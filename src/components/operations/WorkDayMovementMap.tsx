"use client";

import { useEffect, useMemo } from "react";
import Link from "next/link";
import { MapContainer, TileLayer, Marker, Polyline, Popup, useMap } from "react-leaflet";
import L from "leaflet";
import { ExternalLink, MapPin } from "lucide-react";
import type { WorkDayGpsPoint } from "@/lib/workDayReport";
import { googleMapsUrl } from "@/lib/operationsGps";
import { cn } from "@/lib/utils";
import styles from "./workDay.module.css";
import "leaflet/dist/leaflet.css";

const startIcon = L.divIcon({
  className: "workDayMapStart",
  html: `<span style="display:block;width:14px;height:14px;border-radius:50%;background:#16a34a;border:2px solid #fff;box-shadow:0 0 0 2px #16a34a55"></span>`,
  iconSize: [14, 14],
  iconAnchor: [7, 7],
});

const stopIcon = L.divIcon({
  className: "workDayMapStop",
  html: `<span style="display:block;width:14px;height:14px;border-radius:50%;background:#dc2626;border:2px solid #fff;box-shadow:0 0 0 2px #dc262655"></span>`,
  iconSize: [14, 14],
  iconAnchor: [7, 7],
});

function MapBounds({ points }: { points: WorkDayGpsPoint[] }) {
  const map = useMap();
  const latLngs = useMemo(
    () => points.map((p) => [p.lat, p.lng] as [number, number]),
    [points]
  );

  useEffect(() => {
    if (latLngs.length === 0) return;
    if (latLngs.length === 1) {
      map.setView(latLngs[0], 14);
      return;
    }
    map.fitBounds(L.latLngBounds(latLngs), { padding: [32, 32], maxZoom: 15 });
  }, [map, latLngs]);

  return null;
}

type Props = {
  points: WorkDayGpsPoint[];
  distanceKm: number | null;
  stopCount: number;
  locationLabel?: string;
  gpsStatus: string;
  t: (key: string, params?: Record<string, string | number>) => string;
};

export function WorkDayMovementMap({
  points,
  distanceKm,
  stopCount,
  locationLabel,
  gpsStatus,
  t,
}: Props) {
  const polyline = useMemo(
    () => points.map((p) => [p.lat, p.lng] as [number, number]),
    [points]
  );
  const first = points[0];
  const last = points[points.length - 1];

  return (
    <section className={styles.card}>
      <h2 className={cn(styles.sectionTitle, "mb-3")}>{t("workDay.map.title")}</h2>

      {points.length === 0 ? (
        <div className="space-y-3">
          {locationLabel ? (
            <div className="flex items-start gap-2 text-sm">
              <MapPin className="mt-0.5 size-4 shrink-0 text-[#1D376A]" />
              <p>{locationLabel}</p>
            </div>
          ) : null}
          <p className="text-sm text-muted-foreground">{t("workDay.map.noGps")}</p>
          <p className="text-xs font-semibold text-muted-foreground">
            {t(`operations.gps.${gpsStatus}`)}
          </p>
        </div>
      ) : (
        <>
          <div className={styles.mapFrame}>
            <MapContainer
              center={[points[0].lat, points[0].lng]}
              zoom={14}
              className={styles.mapCanvas}
              scrollWheelZoom={false}
            >
              <TileLayer
                attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
                url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
              />
              <MapBounds points={points} />
              {polyline.length >= 2 ? (
                <Polyline positions={polyline} pathOptions={{ color: "#1D376A", weight: 4 }} />
              ) : null}
              {first ? (
                <Marker position={[first.lat, first.lng]} icon={startIcon}>
                  {first.time ? <Popup>{first.time}</Popup> : null}
                </Marker>
              ) : null}
              {last && last !== first ? (
                <Marker position={[last.lat, last.lng]} icon={stopIcon}>
                  {last.time ? <Popup>{last.time}</Popup> : null}
                </Marker>
              ) : null}
            </MapContainer>
          </div>
          <div className="mt-3 grid grid-cols-3 gap-2 text-center text-xs">
            <div>
              <p className="font-extrabold text-[#1D376A]">
                {distanceKm != null ? `${distanceKm} km` : "—"}
              </p>
              <p className="text-muted-foreground">{t("workDay.map.distance")}</p>
            </div>
            <div>
              <p className="font-extrabold text-[#1D376A]">—</p>
              <p className="text-muted-foreground">{t("workDay.map.travel")}</p>
            </div>
            <div>
              <p className="font-extrabold text-[#1D376A]">{stopCount}</p>
              <p className="text-muted-foreground">{t("workDay.map.stops")}</p>
            </div>
          </div>
          {first ? (
            <Link
              href={googleMapsUrl(first.lat, first.lng)}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-3 inline-flex w-full items-center justify-center gap-2 rounded-lg border border-border bg-card px-3 py-2 text-sm font-semibold hover:bg-muted"
            >
              <ExternalLink className="size-4" />
              {t("workDay.map.openExternal")}
            </Link>
          ) : null}
        </>
      )}
    </section>
  );
}
