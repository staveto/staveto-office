"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { MapContainer, TileLayer, Marker, Popup, useMap } from "react-leaflet";
import L from "leaflet";
import type { ProjectDoc } from "@/lib/projects";
import {
  buildProjectMapMarkers,
  projectHasMapLocation,
  type ProjectMapMarker,
} from "@/lib/projectLocation";
import { JobLifecycleBadge } from "@/components/jobs/JobLifecycleBadge";
import { cn } from "@/lib/utils";
import "leaflet/dist/leaflet.css";
import styles from "./projects-map.module.css";

const DEFAULT_CENTER: [number, number] = [48.7164, 19.1455];
const DEFAULT_ZOOM = 7;

const markerIcon = L.divIcon({
  className: styles.markerIcon,
  html: `<span class="${styles.markerDot}" aria-hidden="true"></span>`,
  iconSize: [28, 28],
  iconAnchor: [14, 14],
  popupAnchor: [0, -12],
});

type ProjectsMapViewProps = {
  projects: ProjectDoc[];
  t: (key: string, params?: Record<string, string | number>) => string;
};

function MapBounds({ markers }: { markers: ProjectMapMarker[] }) {
  const map = useMap();

  useEffect(() => {
    if (markers.length === 0) {
      map.setView(DEFAULT_CENTER, DEFAULT_ZOOM);
      return;
    }
    if (markers.length === 1) {
      map.setView([markers[0].lat, markers[0].lng], 13);
      return;
    }
    const bounds = L.latLngBounds(markers.map((m) => [m.lat, m.lng] as [number, number]));
    map.fitBounds(bounds, { padding: [40, 40], maxZoom: 14 });
  }, [map, markers]);

  return null;
}

export function ProjectsMapView({ projects, t }: ProjectsMapViewProps) {
  const [markers, setMarkers] = useState<ProjectMapMarker[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const withLocationCount = useMemo(
    () => projects.filter((p) => projectHasMapLocation(p)).length,
    [projects]
  );

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(false);

    void buildProjectMapMarkers(projects)
      .then((result) => {
        if (!cancelled) setMarkers(result);
      })
      .catch(() => {
        if (!cancelled) {
          setMarkers([]);
          setError(true);
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [projects]);

  if (withLocationCount === 0) {
    return (
      <div className={styles.emptyState}>
        <p className="font-medium">{t("projects.map.empty")}</p>
        <p className="mt-2 text-sm text-muted-foreground">{t("projects.map.emptyHint")}</p>
      </div>
    );
  }

  return (
    <div className={styles.wrapper}>
      <div className={styles.meta}>
        <p className="text-sm text-muted-foreground">
          {loading
            ? t("projects.map.loading")
            : t("projects.map.summary", {
                shown: markers.length,
                total: withLocationCount,
              })}
        </p>
        {error ? (
          <p className="text-sm text-destructive">{t("projects.map.loadError")}</p>
        ) : null}
        {!loading && markers.length < withLocationCount ? (
          <p className="text-xs text-muted-foreground">{t("projects.map.partialHint")}</p>
        ) : null}
      </div>

      <div className={cn(styles.mapFrame, loading && styles.mapFrameLoading)}>
        {loading ? (
          <div className={styles.mapSkeleton} aria-hidden />
        ) : markers.length > 0 ? (
          <MapContainer
            center={DEFAULT_CENTER}
            zoom={DEFAULT_ZOOM}
            className={styles.map}
            scrollWheelZoom
          >
            <TileLayer
              attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
              url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            />
            <MapBounds markers={markers} />
            {markers.map((marker) => (
              <Marker
                key={marker.project.id}
                position={[marker.lat, marker.lng]}
                icon={markerIcon}
              >
                <Popup>
                  <div className={styles.popup}>
                    <p className={styles.popupTitle}>
                      {marker.project.name || t("projects.noName")}
                    </p>
                    {marker.project.customerName ? (
                      <p className={styles.popupMeta}>{marker.project.customerName}</p>
                    ) : null}
                    <p className={styles.popupMeta}>{marker.addressLabel}</p>
                    <div className={styles.popupBadge}>
                      <JobLifecycleBadge project={marker.project} />
                    </div>
                    <Link href={`/app/projects/${marker.project.id}`} className={styles.popupLink}>
                      {t("projects.view")}
                    </Link>
                  </div>
                </Popup>
              </Marker>
            ))}
          </MapContainer>
        ) : (
          <div className={styles.emptyStateInner}>
            <p className="text-sm text-muted-foreground">{t("projects.map.noCoordinates")}</p>
          </div>
        )}
      </div>
    </div>
  );
}
