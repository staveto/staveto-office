"use client";

/**
 * Classic color-picker popover for takeoff mark colors
 * (hex + swatch grid + opacity + presets), rendered in a portal so it
 * is never clipped by the review panel overflow.
 */

import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { Pipette, Plus, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { useI18n } from "@/i18n/I18nContext";

const GRAYS = [
  "#FFFFFF",
  "#F3F4F6",
  "#D1D5DB",
  "#9CA3AF",
  "#6B7280",
  "#4B5563",
  "#374151",
  "#1F2937",
  "#111827",
  "#000000",
];

const SPECTRUM: string[] = [
  "#60A5FA",
  "#3B82F6",
  "#2563EB",
  "#1D4ED8",
  "#1E3A8A",
  "#A78BFA",
  "#8B5CF6",
  "#7C3AED",
  "#6D28D9",
  "#4C1D95",
  "#F472B6",
  "#EC4899",
  "#DB2777",
  "#BE185D",
  "#9D174D",
  "#F87171",
  "#EF4444",
  "#DC2626",
  "#B91C1C",
  "#7F1D1D",
  "#FB923C",
  "#F97316",
  "#EA580C",
  "#C2410C",
  "#9A3412",
  "#FBBF24",
  "#F59E0B",
  "#D97706",
  "#B45309",
  "#92400E",
  "#FACC15",
  "#EAB308",
  "#CA8A04",
  "#A16207",
  "#854D0E",
  "#4ADE80",
  "#22C55E",
  "#16A34A",
  "#15803D",
  "#14532D",
  "#2DD4BF",
  "#14B8A6",
  "#0D9488",
  "#0F766E",
  "#134E4A",
  "#22D3EE",
  "#06B6D4",
  "#0891B2",
  "#0E7490",
  "#164E63",
];

const DEFAULT_PRESETS = [
  "#FFFFFF",
  "#7C3AED",
  "#EC4899",
  "#F97316",
  "#EF4444",
  "#3B82F6",
  "#14B8A6",
  "#EAB308",
  "#22C55E",
  "#111827",
];

function normalizeHex(raw: string): string | null {
  const s = raw.trim();
  const withHash = s.startsWith("#") ? s : `#${s}`;
  if (/^#[0-9A-Fa-f]{6}$/.test(withHash)) return withHash.toUpperCase();
  if (/^#[0-9A-Fa-f]{3}$/.test(withHash)) {
    const r = withHash[1]!;
    const g = withHash[2]!;
    const b = withHash[3]!;
    return `#${r}${r}${g}${g}${b}${b}`.toUpperCase();
  }
  return null;
}

function applyOpacity(hex: string, opacityPct: number): string {
  const n = normalizeHex(hex);
  if (!n || opacityPct >= 100) return n ?? hex;
  const r = parseInt(n.slice(1, 3), 16);
  const g = parseInt(n.slice(3, 5), 16);
  const b = parseInt(n.slice(5, 7), 16);
  const t = opacityPct / 100;
  // Blend toward white so marks stay opaque on the plan (no real alpha in PDF overlay).
  const mix = (c: number) => Math.round(c * t + 255 * (1 - t));
  const to = (c: number) => mix(c).toString(16).padStart(2, "0");
  return `#${to(r)}${to(g)}${to(b)}`.toUpperCase();
}

type StrokeOptions = {
  value: number;
  presets: readonly number[];
  onChange: (width: number) => void;
};

type Props = {
  open: boolean;
  color: string;
  label?: string;
  onClose: () => void;
  onChange: (hex: string) => void;
  /** Optional line thickness (e.g. cable routes) — shown under colors. */
  strokeWidth?: StrokeOptions;
};

export function MarkColorPicker({
  open,
  color,
  label,
  onClose,
  onChange,
  strokeWidth,
}: Props) {
  const { t } = useI18n();
  const initial = normalizeHex(color) ?? "#3B82F6";
  const [hexDraft, setHexDraft] = useState(initial);
  const [opacity, setOpacity] = useState(100);
  const [strokeDraft, setStrokeDraft] = useState(strokeWidth?.value ?? 3);
  const [presets, setPresets] = useState<string[]>(DEFAULT_PRESETS);
  const [eyeDropperSupported] = useState(
    () => typeof window !== "undefined" && "EyeDropper" in window
  );

  useEffect(() => {
    if (!open) return;
    setHexDraft(normalizeHex(color) ?? "#3B82F6");
    setOpacity(100);
    if (strokeWidth) setStrokeDraft(strokeWidth.value);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- sync when dialog opens / color changes
  }, [open, color, strokeWidth?.value]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  const preview = useMemo(
    () => applyOpacity(hexDraft, opacity),
    [hexDraft, opacity]
  );

  if (!open || typeof document === "undefined") return null;

  const commit = (hex: string, nextOpacity = opacity) => {
    const n = normalizeHex(hex);
    if (!n) return;
    setHexDraft(n);
    onChange(applyOpacity(n, nextOpacity));
  };

  const pickEyeDropper = async () => {
    try {
      // Chromium EyeDropper API
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const dropper = new (window as any).EyeDropper();
      const result = await dropper.open();
      if (result?.sRGBHex) commit(result.sRGBHex);
    } catch {
      /* user cancelled */
    }
  };

  return createPortal(
    <div
      className="fixed inset-0 z-[80] flex items-center justify-center bg-black/40 p-4"
      role="presentation"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={t("takeoff.category.colorPickerTitle")}
        data-testid="category-color-picker"
        className="w-[min(20rem,calc(100vw-2rem))] rounded-xl border border-border bg-popover p-3 shadow-2xl"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="mb-2 flex items-center justify-between gap-2">
          <button
            type="button"
            className={cn(
              "rounded-md p-1.5 text-sky-500 hover:bg-muted",
              !eyeDropperSupported && "opacity-40"
            )}
            disabled={!eyeDropperSupported}
            title={t("takeoff.category.eyedropper")}
            aria-label={t("takeoff.category.eyedropper")}
            onClick={() => void pickEyeDropper()}
          >
            <Pipette className="size-4" />
          </button>
          <button
            type="button"
            className="rounded-full p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
            aria-label={t("common.close")}
            onClick={onClose}
          >
            <X className="size-4" />
          </button>
        </div>

        {label ? (
          <p className="mb-2 truncate text-xs text-muted-foreground">{label}</p>
        ) : null}

        <input
          type="text"
          value={hexDraft}
          spellCheck={false}
          className="mb-3 h-9 w-full rounded-md border border-border bg-background px-3 text-sm font-mono uppercase text-foreground"
          aria-label={t("takeoff.category.hexLabel")}
          onChange={(e) => setHexDraft(e.target.value)}
          onBlur={() => {
            const n = normalizeHex(hexDraft);
            if (n) commit(n);
            else setHexDraft(preview);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              const n = normalizeHex(hexDraft);
              if (n) {
                commit(n);
                onClose();
              }
            }
          }}
        />

        <div className="mb-1 grid grid-cols-10 gap-1">
          {GRAYS.map((hex) => (
            <Swatch
              key={`g-${hex}`}
              hex={hex}
              active={preview.toLowerCase() === hex.toLowerCase()}
              onPick={() => commit(hex)}
            />
          ))}
        </div>
        <div className="mb-3 grid grid-cols-10 gap-1">
          {SPECTRUM.map((hex) => (
            <Swatch
              key={hex}
              hex={hex}
              active={preview.toLowerCase() === hex.toLowerCase()}
              onPick={() => commit(hex)}
            />
          ))}
        </div>

        <div className="mb-3 flex items-center gap-2">
          <input
            type="range"
            min={20}
            max={100}
            step={1}
            value={opacity}
            className="h-2 flex-1 cursor-pointer accent-sky-500"
            aria-label={t("takeoff.category.opacity")}
            onChange={(e) => {
              const next = Number(e.target.value);
              setOpacity(next);
              commit(hexDraft, next);
            }}
          />
          <span className="w-10 shrink-0 text-right text-xs tabular-nums text-muted-foreground">
            {opacity}%
          </span>
        </div>

        {strokeWidth ? (
          <div className="mb-3 space-y-1.5 border-t border-border pt-3">
            <div className="flex items-center justify-between gap-2">
              <span className="text-[11px] font-medium text-muted-foreground">
                {t("takeoff.measure.lineThickness")}
              </span>
              <span className="text-[11px] tabular-nums text-foreground">
                {strokeDraft} px
              </span>
            </div>
            <input
              type="range"
              min={1}
              max={8}
              step={0.5}
              value={strokeDraft}
              className="h-2 w-full cursor-pointer accent-emerald-600"
              aria-label={t("takeoff.measure.lineThickness")}
              data-testid="color-picker-stroke"
              onChange={(e) => {
                const next = Number(e.target.value);
                setStrokeDraft(next);
                strokeWidth.onChange(next);
              }}
            />
            <div className="flex items-center gap-1">
              {strokeWidth.presets.map((w) => {
                const active = Math.abs(strokeDraft - w) < 0.05;
                return (
                  <button
                    key={w}
                    type="button"
                    className={cn(
                      "flex h-7 flex-1 items-center justify-center rounded-md border px-1",
                      active
                        ? "border-emerald-600 bg-emerald-50 dark:bg-emerald-950/50"
                        : "border-border bg-background hover:bg-muted/60"
                    )}
                    title={`${w} px`}
                    aria-pressed={active}
                    onClick={() => {
                      setStrokeDraft(w);
                      strokeWidth.onChange(w);
                    }}
                  >
                    <span
                      className="block w-full rounded-full"
                      style={{
                        height: Math.max(1.5, w * 0.7),
                        backgroundColor: preview,
                      }}
                    />
                  </button>
                );
              })}
            </div>
          </div>
        ) : null}

        <div className="flex items-center gap-2">
          <span
            className="flex size-10 shrink-0 items-center justify-center rounded-md border border-border"
            style={{ backgroundColor: `${preview}22` }}
            title={preview}
          >
            <span
              className="block w-7 rounded-full"
              style={{
                height: strokeWidth ? Math.max(2, strokeDraft) : 10,
                backgroundColor: preview,
              }}
            />
          </span>
          <div className="flex min-w-0 flex-1 flex-wrap gap-1.5">
            {presets.map((hex) => (
              <button
                key={`p-${hex}`}
                type="button"
                className={cn(
                  "size-6 rounded-full border-2",
                  preview.toLowerCase() === hex.toLowerCase()
                    ? "border-foreground"
                    : "border-transparent"
                )}
                style={{ backgroundColor: hex }}
                title={hex}
                aria-label={hex}
                onClick={() => commit(hex)}
              />
            ))}
            <button
              type="button"
              className="flex size-6 items-center justify-center rounded-full border border-dashed border-border text-muted-foreground hover:bg-muted"
              title={t("takeoff.category.addPreset")}
              aria-label={t("takeoff.category.addPreset")}
              onClick={() => {
                const n = normalizeHex(preview);
                if (!n) return;
                setPresets((prev) =>
                  prev.includes(n) ? prev : [...prev.slice(0, 9), n]
                );
              }}
            >
              <Plus className="size-3.5" />
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}

function Swatch({
  hex,
  active,
  onPick,
}: {
  hex: string;
  active: boolean;
  onPick: () => void;
}) {
  return (
    <button
      type="button"
      className={cn(
        "aspect-square w-full rounded-sm border",
        active ? "border-white ring-2 ring-sky-400" : "border-black/10 dark:border-white/10"
      )}
      style={{ backgroundColor: hex }}
      title={hex}
      aria-label={hex}
      aria-pressed={active}
      data-testid="category-color-swatch"
      onClick={onPick}
    />
  );
}
