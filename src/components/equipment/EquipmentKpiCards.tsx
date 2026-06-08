"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useI18n } from "@/i18n/I18nContext";

type EquipmentKpiCardsProps = {
  total: number;
  assigned: number;
  inService: number;
};

export function EquipmentKpiCards({ total, assigned, inService }: EquipmentKpiCardsProps) {
  const { t } = useI18n();

  const cards = [
    { label: t("equipmentTab.statTotal"), value: total },
    { label: t("equipmentTab.statAssigned"), value: assigned },
    { label: t("equipmentTab.statInService"), value: inService },
  ];

  return (
    <div className="grid gap-4 sm:grid-cols-3">
      {cards.map((card) => (
        <Card key={card.label} className="border-[#E2E8F0]">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">{card.label}</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-semibold tabular-nums text-[#0F2A4D]">{card.value}</p>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
