"use client";

import { useState } from "react";
import dynamic from "next/dynamic";
import { Loader2, MapPin, Map as MapIcon, Type } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { useI18n } from "@/i18n/I18nContext";
import { useActiveWorkspaceContext } from "@/hooks/useActiveWorkspaceContext";
import type { ProjectCoordinates } from "@/lib/projectLocation";
import { cn } from "@/lib/utils";
import { nj } from "@/components/jobs/new/newJobFormStyles";
import styles from "./job-site-location-map.module.css";

const JobSiteLocationMapPicker = dynamic(
  () =>
    import("./JobSiteLocationMapPicker").then((module) => module.JobSiteLocationMapPicker),
  {
    ssr: false,
    loading: () => (
      <div className={cn(styles.mapFrame, "flex items-center justify-center")}>
        <Loader2 className="size-6 animate-spin text-[#1D376A]" aria-hidden />
      </div>
    ),
  }
);

type LocationMode = "text" | "map";

type Props = {
  id?: string;
  label?: string;
  value: string;
  onChange: (value: string) => void;
  onCoordinatesChange?: (coords: ProjectCoordinates | null) => void;
  countryCode?: string | null;
  placeholder?: string;
  className?: string;
};

export function JobSiteLocationField({
  id = "job-site-location",
  label,
  value,
  onChange,
  onCoordinatesChange,
  countryCode,
  placeholder,
  className,
}: Props) {
  const { t } = useI18n();
  const workspaceCtx = useActiveWorkspaceContext();
  const resolvedCountry = countryCode ?? workspaceCtx?.activeCountryCode ?? null;
  const [mode, setMode] = useState<LocationMode>("text");

  const resolvedLabel = label ?? t("projects.new.location");
  const resolvedPlaceholder = placeholder ?? t("projects.new.locationPlaceholder");

  return (
    <div className={cn("space-y-2", className)}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Label htmlFor={id} className={nj.label}>
          {resolvedLabel}
        </Label>
        <div className="inline-flex rounded-lg border border-[#CBD5E1] bg-white p-1">
          <Button
            type="button"
            size="sm"
            variant={mode === "text" ? "default" : "ghost"}
            className={cn(
              "h-8 gap-1.5",
              mode === "text" && "bg-[#1D376A] hover:bg-[#152a52] text-white"
            )}
            onClick={() => setMode("text")}
          >
            <Type className="size-3.5" aria-hidden />
            {t("projects.new.locationModeText")}
          </Button>
          <Button
            type="button"
            size="sm"
            variant={mode === "map" ? "default" : "ghost"}
            className={cn(
              "h-8 gap-1.5",
              mode === "map" && "bg-[#1D376A] hover:bg-[#152a52] text-white"
            )}
            onClick={() => setMode("map")}
          >
            <MapIcon className="size-3.5" aria-hidden />
            {t("projects.new.locationModeMap")}
          </Button>
        </div>
      </div>

      {mode === "text" ? (
        <div className="relative">
          <MapPin
            className="absolute left-4 top-1/2 -translate-y-1/2 size-5 text-[#64748B]"
            aria-hidden
          />
          <Input
            id={id}
            value={value}
            onChange={(e) => {
              onChange(e.target.value);
              if (!e.target.value.trim()) onCoordinatesChange?.(null);
            }}
            placeholder={resolvedPlaceholder}
            className={nj.inputWithIcon}
          />
        </div>
      ) : (
        <div className="space-y-2">
          <p className={styles.hint}>{t("projects.new.locationMapHint")}</p>
          <JobSiteLocationMapPicker
            address={value}
            countryCode={resolvedCountry}
            onAddressChange={onChange}
            onCoordinatesChange={onCoordinatesChange}
          />
        </div>
      )}
    </div>
  );
}
