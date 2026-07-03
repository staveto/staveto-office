"use client";

import { useEffect, useMemo, useState } from "react";
import { MapContainer, Marker, TileLayer, useMap, useMapEvents } from "react-leaflet";
import L from "leaflet";
import { Loader2 } from "lucide-react";
import { useTheme } from "next-themes";
import { useI18n } from "@/i18n/I18nContext";
import {
  geocodeProjectAddress,
  getDefaultMapCenter,
  reverseGeocodeCoordinates,
  type ProjectCoordinates,
} from "@/lib/projectLocation";
import { cn } from "@/lib/utils";
import "leaflet/dist/leaflet.css";
import styles from "./job-site-location-map.module.css";

const MAP_TILES = {
  light: {
    url: "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
    attribution:
      '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
  },
  dark: {
    // Voyager: readable streets/labels inside dark UI (dark_all was too low-contrast)
    url: "https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png",
    attribution:
      '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>',
  },
} as const;

const pickerMarkerIcon = L.divIcon({
  className: styles.markerIcon,
  html: `<span class="${styles.markerDot}" aria-hidden="true"></span>`,
  iconSize: [18, 18],
  iconAnchor: [9, 9],
});

type Props = {
  address: string;
  countryCode?: string | null;
  onAddressChange: (address: string) => void;
  onCoordinatesChange?: (coords: ProjectCoordinates | null) => void;
};

function MapViewport({
  center,
  zoom,
  marker,
}: {
  center: ProjectCoordinates;
  zoom: number;
  marker: ProjectCoordinates | null;
}) {
  const map = useMap();

  useEffect(() => {
    map.setView([center.lat, center.lng], zoom, { animate: true });
  }, [center.lat, center.lng, map, zoom]);

  return marker ? <Marker position={[marker.lat, marker.lng]} icon={pickerMarkerIcon} /> : null;
}

function MapClickHandler({
  onPick,
}: {
  onPick: (coords: ProjectCoordinates) => void;
}) {
  useMapEvents({
    click(event) {
      onPick({ lat: event.latlng.lat, lng: event.latlng.lng });
    },
  });
  return null;
}

export function JobSiteLocationMapPicker({
  address,
  countryCode,
  onAddressChange,
  onCoordinatesChange,
}: Props) {
  const { t } = useI18n();
  const { resolvedTheme } = useTheme();
  const isDark = resolvedTheme === "dark";
  const tiles = isDark ? MAP_TILES.dark : MAP_TILES.light;
  const defaultCenter = useMemo(() => getDefaultMapCenter(countryCode), [countryCode]);
  const [center, setCenter] = useState<ProjectCoordinates>(defaultCenter);
  const [marker, setMarker] = useState<ProjectCoordinates | null>(null);
  const [resolving, setResolving] = useState(false);
  const [mapError, setMapError] = useState<string | null>(null);

  useEffect(() => {
    const trimmed = address.trim();
    if (!trimmed) {
      setCenter(defaultCenter);
      return;
    }

    let cancelled = false;
    void geocodeProjectAddress(trimmed).then((coords) => {
      if (cancelled) return;
      if (coords) {
        setCenter(coords);
        setMarker(coords);
      }
    });

    return () => {
      cancelled = true;
    };
  }, [address, defaultCenter]);

  const handlePick = async (coords: ProjectCoordinates) => {
    setMarker(coords);
    setCenter(coords);
    onCoordinatesChange?.(coords);
    setResolving(true);
    setMapError(null);
    try {
      const label = await reverseGeocodeCoordinates(coords.lat, coords.lng);
      if (label) {
        onAddressChange(label);
      } else {
        setMapError("reverse-failed");
      }
    } finally {
      setResolving(false);
    }
  };

  return (
    <div>
      <div className={cn(styles.mapFrame)}>
        <MapContainer center={[center.lat, center.lng]} zoom={13} className={styles.map} scrollWheelZoom>
          <TileLayer attribution={tiles.attribution} url={tiles.url} />
          <MapClickHandler onPick={(coords) => void handlePick(coords)} />
          <MapViewport center={center} zoom={marker ? 15 : 13} marker={marker} />
        </MapContainer>
        {resolving ? (
          <div className={styles.loadingOverlay}>
            <Loader2 className="size-6 animate-spin text-[#1D376A] dark:text-[#CBD5E1]" aria-hidden />
          </div>
        ) : null}
      </div>
      {address.trim() ? <p className={styles.selectedAddress}>{address}</p> : null}
      {mapError ? (
        <p className="mt-2 text-sm text-destructive" role="alert">
          {t("projects.new.locationReverseGeocodeError")}
        </p>
      ) : null}
    </div>
  );
}
