"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, Loader2, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { useI18n } from "@/i18n/I18nContext";
import { eq, eqCategoryPill } from "@/components/equipment/equipmentFormStyles";
import { cn } from "@/lib/utils";
import {
  createMyEquipmentServiceRule,
  createMyEquipmentServiceTaskFromRule,
  getMyEquipment,
  getMyEquipmentServiceRule,
  updateMyEquipmentServiceRule,
} from "@/services/equipment";

function genId() {
  return `id_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`;
}

type EquipmentServiceRuleFormProps = {
  equipmentId: string;
  ruleId?: string;
};

export function EquipmentServiceRuleForm({ equipmentId, ruleId }: EquipmentServiceRuleFormProps) {
  const router = useRouter();
  const { t } = useI18n();
  const isEdit = !!ruleId;

  const [equipmentName, setEquipmentName] = useState("");
  const [title, setTitle] = useState("");
  const [intervalUnit, setIntervalUnit] = useState<"weeks" | "months">("weeks");
  const [intervalValue, setIntervalValue] = useState("1");
  const [startFromDate, setStartFromDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [checklistItems, setChecklistItems] = useState<{ id: string; title: string }[]>([]);
  const [loading, setLoading] = useState(isEdit);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const eqDoc = await getMyEquipment(equipmentId);
        if (!cancelled) setEquipmentName(eqDoc?.name ?? "");

        if (isEdit && ruleId) {
          setLoading(true);
          const rule = await getMyEquipmentServiceRule(equipmentId, ruleId);
          if (cancelled || !rule) return;
          setTitle(rule.title);
          setIntervalUnit(rule.intervalUnit);
          setIntervalValue(String(rule.intervalValue));
          setStartFromDate(
            rule.startFrom ? rule.startFrom.slice(0, 10) : new Date().toISOString().slice(0, 10)
          );
          setChecklistItems(
            (rule.checklistTemplate ?? []).map((i) => ({ id: i.id || genId(), title: i.title }))
          );
        }
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : t("equipment.loadServiceRuleFailed"));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [equipmentId, isEdit, ruleId, t]);

  const handleSave = async () => {
    if (!title.trim()) {
      setError(t("equipment.servicePlanNameRequired"));
      return;
    }
    const val = parseInt(intervalValue, 10);
    if (Number.isNaN(val) || val < 1) {
      setError(t("equipment.intervalMustBePositive"));
      return;
    }

    setSaving(true);
    setError(null);
    try {
      const checklist = checklistItems
        .filter((i) => i.title.trim())
        .map((i) => ({ id: i.id, title: i.title.trim() }));
      const startFrom = new Date(startFromDate);

      if (isEdit && ruleId) {
        await updateMyEquipmentServiceRule(equipmentId, ruleId, {
          title: title.trim(),
          intervalUnit,
          intervalValue: val,
          startFrom,
          checklistTemplate: checklist,
        });
      } else {
        const rule = await createMyEquipmentServiceRule(equipmentId, {
          title: title.trim(),
          intervalUnit,
          intervalValue: val,
          startFrom,
          checklistTemplate: checklist,
        });
        const dueAt = new Date(rule.nextDueAt);
        await createMyEquipmentServiceTaskFromRule(equipmentId, rule, dueAt);
      }
      router.push(`/app/equipment/${equipmentId}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : t("equipment.saveError"));
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center py-16">
        <Loader2 className="size-7 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className={eq.pageWrap}>
      <div>
        <Link
          href={`/app/equipment/${equipmentId}`}
          className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground mb-3"
        >
          <ArrowLeft className="size-4" />
          {equipmentName || t("equipment.title")}
        </Link>
        <h1 className={eq.pageTitle}>
          {isEdit ? t("equipment.editServicePlanTitle") : t("equipment.addServicePlanTitle")}
        </h1>
      </div>

      <Card className="border-[#E2E8F0] shadow-sm">
        <CardContent className="p-5 sm:p-6 space-y-5">
          {error && <div className={eq.errorBanner}>{error}</div>}

          <div>
            <Label htmlFor="sr-title">{t("equipment.serviceRuleNameLabel")}</Label>
            <Input
              id="sr-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder={t("equipment.serviceRuleNamePlaceholder")}
              className="mt-1.5"
            />
          </div>

          <div>
            <Label>{t("equipment.formServiceIntervalEvery")}</Label>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <Input
                type="number"
                min={1}
                value={intervalValue}
                onChange={(e) => setIntervalValue(e.target.value)}
                className="w-24"
              />
              <div className="flex gap-2">
                {(["weeks", "months"] as const).map((unit) => (
                  <button
                    key={unit}
                    type="button"
                    onClick={() => setIntervalUnit(unit)}
                    className={cn(eqCategoryPill(intervalUnit === unit), "px-4")}
                  >
                    {unit === "weeks" ? t("equipment.weeks") : t("equipment.months")}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div>
            <Label htmlFor="sr-start">{t("equipment.formServiceStartDate")}</Label>
            <Input
              id="sr-start"
              type="date"
              value={startFromDate}
              onChange={(e) => setStartFromDate(e.target.value)}
              className="mt-1.5"
            />
          </div>

          <div>
            <Label>{t("equipment.formServiceChecklist")}</Label>
            <div className="mt-2 space-y-2">
              {checklistItems.map((item) => (
                <div key={item.id} className="flex gap-2">
                  <Input
                    value={item.title}
                    onChange={(e) =>
                      setChecklistItems((prev) =>
                        prev.map((i) => (i.id === item.id ? { ...i, title: e.target.value } : i))
                      )
                    }
                    placeholder={t("equipment.itemPlaceholder")}
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    onClick={() => setChecklistItems((prev) => prev.filter((i) => i.id !== item.id))}
                  >
                    <Trash2 className="size-4" />
                  </Button>
                </div>
              ))}
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setChecklistItems((prev) => [...prev, { id: genId(), title: "" }])}
              >
                <Plus className="size-4 mr-2" />
                {t("equipment.formServiceAddChecklist")}
              </Button>
            </div>
          </div>

          <div className={eq.actionBar}>
            <Button type="button" onClick={() => void handleSave()} disabled={saving}>
              {saving ? t("common.loading") : t("common.save")}
            </Button>
            <Button type="button" variant="outline" onClick={() => router.push(`/app/equipment/${equipmentId}`)}>
              {t("common.cancel")}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
