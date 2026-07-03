"use client";

import { useMemo } from "react";
import { Calculator, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useI18n } from "@/i18n/I18nContext";
import { parseLocalizedNumber } from "@/lib/ai/localizedNumber";
import { sumFloorAreaM2 } from "@/lib/ai/materialQuantityFromFacts";
import type { AiProjectFactsPersisted } from "./aiSetupTypes";

type Props = {
  projectFacts?: AiProjectFactsPersisted;
  onProjectFactsChange: (facts: AiProjectFactsPersisted) => void;
  onApplyToMaterials: () => void;
  applying?: boolean;
};

function parseAreaInput(raw: string): number | undefined {
  const trimmed = raw.trim();
  if (!trimmed) return undefined;
  return parseLocalizedNumber(trimmed);
}

function formatAreaValue(value?: number): string {
  if (value == null || !Number.isFinite(value) || value <= 0) return "";
  return String(value);
}

export function AiSetupProjectFactsPanel({
  projectFacts,
  onProjectFactsChange,
  onApplyToMaterials,
  applying,
}: Props) {
  const { t } = useI18n();

  const facts = projectFacts ?? {};
  const rooms = facts.rooms ?? [];
  const dimensions = facts.dimensions ?? [];

  const roomsSum = useMemo(
    () =>
      rooms.reduce((sum, room) => sum + (room.areaM2 && room.areaM2 > 0 ? room.areaM2 : 0), 0),
    [rooms]
  );

  const computedFloorArea = sumFloorAreaM2(facts, null);

  const hasContent =
    Boolean(facts.buildingType?.trim()) ||
    (facts.totalKnownAreaM2 ?? 0) > 0 ||
    rooms.length > 0 ||
    dimensions.length > 0;

  if (!hasContent && !projectFacts) return null;

  const patch = (next: AiProjectFactsPersisted) => {
    onProjectFactsChange({
      buildingType: next.buildingType?.trim() || undefined,
      totalKnownAreaM2: next.totalKnownAreaM2,
      rooms: next.rooms?.length ? next.rooms : undefined,
      dimensions: next.dimensions?.length ? next.dimensions : undefined,
    });
  };

  return (
    <div className="rounded-xl border-2 border-[#1D376A]/20 bg-[#F0F4FA] p-4 space-y-4">
      <div className="flex items-start gap-2">
        <Calculator className="size-5 text-[#1D376A] shrink-0 mt-0.5" />
        <div className="min-w-0 flex-1">
          <h4 className="text-sm font-bold text-[#0F2A4D]">
            {t("projects.aiSetup.facts.title")}
          </h4>
          <p className="text-xs text-[#64748B] mt-0.5 leading-relaxed">
            {t("projects.aiSetup.facts.editLead")}
          </p>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <label className="space-y-1">
          <span className="text-xs font-semibold text-[#64748B] uppercase">
            {t("projects.aiSetup.facts.buildingType")}
          </span>
          <Input
            value={facts.buildingType ?? ""}
            onChange={(e) => patch({ ...facts, buildingType: e.target.value })}
            className="h-10 bg-white"
            placeholder={t("projects.aiSetup.facts.buildingTypePlaceholder")}
          />
        </label>
        <label className="space-y-1">
          <span className="text-xs font-semibold text-[#64748B] uppercase">
            {t("projects.aiSetup.facts.totalArea")}
          </span>
          <div className="flex items-center gap-2">
            <Input
              defaultValue={formatAreaValue(facts.totalKnownAreaM2)}
              key={`total-${facts.totalKnownAreaM2 ?? "empty"}`}
              onBlur={(e) => {
                const parsed = parseAreaInput(e.target.value);
                patch({
                  ...facts,
                  totalKnownAreaM2: parsed,
                });
                if (parsed !== undefined) {
                  e.target.value = formatAreaValue(parsed);
                }
              }}
              className="h-10 bg-white tabular-nums"
              placeholder="86,5"
              inputMode="decimal"
            />
            <span className="text-sm text-[#64748B] shrink-0">m²</span>
          </div>
        </label>
      </div>

      {roomsSum > 0 ? (
        <p className="text-xs text-[#64748B]">
          {t("projects.aiSetup.facts.roomsSum", { area: String(roomsSum) })}
        </p>
      ) : computedFloorArea != null && computedFloorArea !== facts.totalKnownAreaM2 ? (
        <p className="text-xs text-[#64748B]">
          {t("projects.aiSetup.facts.computedArea", { area: String(computedFloorArea) })}
        </p>
      ) : null}

      <div className="space-y-2">
        <div className="flex items-center justify-between gap-2">
          <p className="text-xs font-semibold text-[#64748B] uppercase">
            {t("projects.aiSetup.facts.rooms")}
          </p>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-8 text-[#1D376A]"
            onClick={() =>
              patch({
                ...facts,
                rooms: [...rooms, { name: "", areaM2: undefined }],
              })
            }
          >
            <Plus className="size-3.5 mr-1" />
            {t("projects.aiSetup.facts.addRoom")}
          </Button>
        </div>
        {rooms.length === 0 ? (
          <p className="text-xs text-[#94A3B8]">{t("projects.aiSetup.facts.roomsEmpty")}</p>
        ) : (
          <ul className="space-y-2">
            {rooms.map((room, idx) => (
              <li key={`room-${idx}`} className="flex flex-wrap gap-2 items-end">
                <label className="flex-1 min-w-[120px] space-y-1">
                  <span className="text-[10px] font-semibold text-[#64748B] uppercase">
                    {t("projects.aiSetup.facts.roomName")}
                  </span>
                  <Input
                    value={room.name}
                    onChange={(e) => {
                      const next = [...rooms];
                      next[idx] = { ...room, name: e.target.value };
                      patch({ ...facts, rooms: next });
                    }}
                    className="h-9 bg-white"
                  />
                </label>
                <label className="w-28 space-y-1">
                  <span className="text-[10px] font-semibold text-[#64748B] uppercase">
                    {t("projects.aiSetup.col.qty")} m²
                  </span>
                  <Input
                    defaultValue={formatAreaValue(room.areaM2)}
                    key={`room-area-${idx}-${room.areaM2 ?? "x"}`}
                    onBlur={(e) => {
                      const parsed = parseAreaInput(e.target.value);
                      const next = [...rooms];
                      next[idx] = { ...room, areaM2: parsed };
                      patch({ ...facts, rooms: next });
                      if (parsed !== undefined) e.target.value = formatAreaValue(parsed);
                    }}
                    className="h-9 bg-white tabular-nums"
                    placeholder="12,5"
                    inputMode="decimal"
                  />
                </label>
                <button
                  type="button"
                  className="p-2 text-[#64748B] hover:text-destructive rounded-lg hover:bg-red-50 mb-0.5"
                  onClick={() => patch({ ...facts, rooms: rooms.filter((_, i) => i !== idx) })}
                  aria-label={t("common.delete")}
                >
                  <Trash2 className="size-4" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="space-y-2">
        <div className="flex items-center justify-between gap-2">
          <p className="text-xs font-semibold text-[#64748B] uppercase">
            {t("projects.aiSetup.facts.dimensions")}
          </p>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-8 text-[#1D376A]"
            onClick={() =>
              patch({
                ...facts,
                dimensions: [...dimensions, { label: "", value: "" }],
              })
            }
          >
            <Plus className="size-3.5 mr-1" />
            {t("projects.aiSetup.facts.addDimension")}
          </Button>
        </div>
        {dimensions.length === 0 ? (
          <p className="text-xs text-[#94A3B8]">{t("projects.aiSetup.facts.dimensionsEmpty")}</p>
        ) : (
          <ul className="space-y-2">
            {dimensions.map((dim, idx) => (
              <li key={`dim-${idx}`} className="flex flex-wrap gap-2 items-end">
                <label className="flex-1 min-w-[120px] space-y-1">
                  <span className="text-[10px] font-semibold text-[#64748B] uppercase">
                    {t("projects.aiSetup.facts.dimLabel")}
                  </span>
                  <Input
                    value={dim.label}
                    onChange={(e) => {
                      const next = [...dimensions];
                      next[idx] = { ...dim, label: e.target.value };
                      patch({ ...facts, dimensions: next });
                    }}
                    className="h-9 bg-white"
                    placeholder={t("projects.aiSetup.facts.dimLabelPlaceholder")}
                  />
                </label>
                <label className="flex-1 min-w-[100px] space-y-1">
                  <span className="text-[10px] font-semibold text-[#64748B] uppercase">
                    {t("projects.aiSetup.facts.dimValue")}
                  </span>
                  <Input
                    value={dim.value}
                    onChange={(e) => {
                      const next = [...dimensions];
                      next[idx] = { ...dim, value: e.target.value };
                      patch({ ...facts, dimensions: next });
                    }}
                    className="h-9 bg-white"
                    placeholder="71 m"
                  />
                </label>
                <button
                  type="button"
                  className="p-2 text-[#64748B] hover:text-destructive rounded-lg hover:bg-red-50 mb-0.5"
                  onClick={() =>
                    patch({ ...facts, dimensions: dimensions.filter((_, i) => i !== idx) })
                  }
                  aria-label={t("common.delete")}
                >
                  <Trash2 className="size-4" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <Button
        type="button"
        variant="outline"
        size="sm"
        className="border-[#1D376A]/30 text-[#1D376A] hover:bg-white"
        disabled={applying}
        onClick={onApplyToMaterials}
      >
        {applying ? t("common.loading") : t("projects.aiSetup.facts.applyToMaterials")}
      </Button>
    </div>
  );
}
