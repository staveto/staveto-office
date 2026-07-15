"use client";

import { useState } from "react";
import { AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useI18n } from "@/i18n/I18nContext";
import type { EstimatorQuantityConflict } from "@/types/estimatorPositions";
import type { ConflictResolution } from "@/components/projects/setup/useEstimatorPositions";

type Props = {
  conflicts: EstimatorQuantityConflict[];
  onResolve: (
    conflictId: string,
    resolution: ConflictResolution,
    manualQty?: number,
    note?: string
  ) => void;
  onSaveNote?: (conflictId: string, note: string) => void;
};

export function EstimatorDocumentConflictsPanel({ conflicts, onResolve, onSaveNote }: Props) {
  const { t } = useI18n();
  const open = conflicts.filter((c) => c.status === "open");
  const [manualFor, setManualFor] = useState<string | null>(null);
  const [manualQty, setManualQty] = useState("");
  const [noteFor, setNoteFor] = useState<string | null>(null);
  const [note, setNote] = useState("");

  if (open.length === 0) return null;

  return (
    <section className="rounded-xl border border-amber-300 bg-amber-50/80 p-4 space-y-3">
      <div className="flex items-center gap-2">
        <AlertTriangle className="size-5 text-amber-700 shrink-0" />
        <h4 className="text-sm font-bold text-amber-900">
          {t("projects.aiSetup.conflicts.title")}
        </h4>
      </div>
      <ul className="space-y-3">
        {open.map((c) => (
          <li
            key={c.id}
            className="rounded-lg border border-amber-200 bg-white p-3 space-y-2 text-sm"
          >
            <p className="font-semibold text-[#0F2A4D]">
              {c.label}
              {c.roomName ? (
                <span className="ml-2 font-normal text-[#64748B]">· {c.roomName}</span>
              ) : null}
            </p>
            <p className="text-[#475569]">
              {t("projects.aiSetup.conflicts.summary", {
                drawing: c.drawingQty ?? "—",
                schedule: c.scheduleQty ?? "—",
                unit: c.unit,
              })}
            </p>
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="h-8 text-xs"
                onClick={() => onResolve(c.id, "drawing")}
              >
                {t("projects.aiSetup.conflicts.useDrawing")}
              </Button>
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="h-8 text-xs"
                onClick={() => onResolve(c.id, "schedule")}
              >
                {t("projects.aiSetup.conflicts.useSchedule")}
              </Button>
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="h-8 text-xs"
                onClick={() => {
                  setManualFor(c.id);
                  setManualQty("");
                }}
              >
                {t("projects.aiSetup.conflicts.useManual")}
              </Button>
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="h-8 text-xs"
                onClick={() => onResolve(c.id, "exclude")}
              >
                {t("projects.aiSetup.conflicts.exclude")}
              </Button>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                className="h-8 text-xs"
                onClick={() => {
                  setNoteFor(c.id);
                  setNote(c.note ?? "");
                }}
              >
                {t("projects.aiSetup.conflicts.addNote")}
              </Button>
            </div>
            {manualFor === c.id ? (
              <div className="flex flex-wrap items-center gap-2 pt-1">
                <Input
                  type="number"
                  min={0}
                  step="any"
                  value={manualQty}
                  onChange={(e) => setManualQty(e.target.value)}
                  className="h-8 w-24 text-sm"
                  placeholder={t("projects.aiSetup.conflicts.manualQty")}
                />
                <Button
                  type="button"
                  size="sm"
                  className="h-8"
                  onClick={() => {
                    const qty = Number(manualQty);
                    if (qty > 0) {
                      onResolve(c.id, "manual", qty);
                      setManualFor(null);
                    }
                  }}
                >
                  {t("projects.aiSetup.conflicts.confirmManual")}
                </Button>
              </div>
            ) : null}
            {noteFor === c.id ? (
              <div className="flex flex-wrap items-center gap-2 pt-1">
                <Input
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  className="h-8 flex-1 min-w-[200px] text-sm"
                  placeholder={t("projects.aiSetup.conflicts.notePlaceholder")}
                />
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="h-8"
                  onClick={() => {
                    onSaveNote?.(c.id, note);
                    setNoteFor(null);
                  }}
                >
                  {t("projects.aiSetup.conflicts.saveNote")}
                </Button>
              </div>
            ) : null}
          </li>
        ))}
      </ul>
    </section>
  );
}
