"use client";

import { useEffect, useMemo } from "react";
import Link from "next/link";
import { MapContainer, TileLayer, Marker, Popup, useMap } from "react-leaflet";
import L from "leaflet";
import { googleMapsUrl } from "@/lib/operationsGps";
import { formatTimerHms } from "@/lib/operationsMetrics";
import type { WorkerMapMarker } from "@/services/operations/operationsMapViewService";
import type { HideGpsPart } from "@/services/attendance/timeEntryGpsModerationService";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import styles from "./operations.module.css";
import "leaflet/dist/leaflet.css";

const workerIcon = L.divIcon({
  className: "opsMapMarkerWorker",
  html: `<span class="${styles.opsMapMarkerWorkerDot}" aria-hidden="true"></span>`,
  iconSize: [32, 32],
  iconAnchor: [16, 16],
  popupAnchor: [0, -14],
});

type Props = {
  workerMarkers: WorkerMapMarker[];
  selectedUid: string | null;
  onSelectUid: (uid: string) => void;
  t: (key: string, params?: Record<string, string | number>) => string;
  canModerateGps?: boolean;
  onRequestHideGps?: (input: { entryId: string; part: HideGpsPart }) => void;
};

function MapBounds({ workerMarkers }: { workerMarkers: WorkerMapMarker[] }) {
  const map = useMap();
  const points = useMemo(
    () => workerMarkers.map((m) => [m.lat, m.lng] as [number, number]),
    [workerMarkers]
  );

  useEffect(() => {
    if (points.length === 0) return;
    if (points.length === 1) {
      map.setView(points[0], 14);
      return;
    }
    map.fitBounds(L.latLngBounds(points), { padding: [48, 48], maxZoom: 15 });
  }, [map, points]);

  return null;
}

export function OperationsLocationMap({
  workerMarkers,
  selectedUid,
  onSelectUid,
  t,
  canModerateGps = false,
  onRequestHideGps,
}: Props) {
  if (workerMarkers.length === 0) {
    return null;
  }

  return (
    <div className={styles.opsMapFrame}>
      <MapContainer
        center={[workerMarkers[0].lat, workerMarkers[0].lng]}
        zoom={14}
        className={styles.opsMapCanvas}
        scrollWheelZoom
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        <MapBounds workerMarkers={workerMarkers} />
        {workerMarkers.map((m) => (
          <Marker
            key={`worker-${m.uid}-${m.source}`}
            position={[m.lat, m.lng]}
            icon={workerIcon}
            eventHandlers={{
              click: () => onSelectUid(m.uid),
            }}
          >
            <Popup>
              <div className={styles.opsMapPopup}>
                <p className="text-sm font-bold">{m.name}</p>
                {m.projectName ? (
                  <p className="mt-0.5 text-xs text-muted-foreground">{m.projectName}</p>
                ) : null}
                <p className="mt-1 text-xs font-semibold">{t(`operations.status.${m.status}`)}</p>
                {typeof m.timerSeconds === "number" ? (
                  <p className="mt-1 text-sm font-extrabold tabular-nums text-emerald-700">
                    {formatTimerHms(m.timerSeconds)}
                  </p>
                ) : null}
                <div className="mt-3 flex flex-col gap-1.5">
                  <Link
                    href={googleMapsUrl(m.lat, m.lng)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center justify-center rounded-md border border-border px-2 py-1 text-xs font-semibold text-[#1D376A] hover:bg-muted"
                  >
                    {t("operations.mapView.openInMaps")}
                  </Link>
                  {m.projectId ? (
                    <Link
                      href={`/app/projects/${m.projectId}`}
                      className="inline-flex items-center justify-center rounded-md bg-[#1D376A] px-2 py-1 text-xs font-semibold text-white hover:opacity-90"
                    >
                      {t("operations.mapView.openProject")}
                    </Link>
                  ) : null}
                  {canModerateGps &&
                  onRequestHideGps &&
                  m.entryId &&
                  m.gpsPart &&
                  m.source === "completed" ? (
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      className="h-7 w-full text-xs"
                      onClick={() =>
                        onRequestHideGps({ entryId: m.entryId!, part: m.gpsPart! })
                      }
                    >
                      {t("operations.gps.hideLocation")}
                    </Button>
                  ) : null}
                </div>
              </div>
            </Popup>
          </Marker>
        ))}
      </MapContainer>
      {selectedUid ? (
        <div className={cn(styles.opsMapSelectedChip, "pointer-events-none")}>
          {workerMarkers.find((m) => m.uid === selectedUid)?.name}
        </div>
      ) : null}
    </div>
  );
}
