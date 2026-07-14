"use client";

/**
 * Trade + type picker for takeoff occurrences — configurable catalog,
 * not hardcoded to electrical. Picking a type prefills the label.
 */

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { useI18n } from "@/i18n/I18nContext";
import type { TakeoffTrade } from "@/types/drawingTakeoff";
import { TAKEOFF_TRADES } from "@/types/drawingTakeoff";
import { typesForTrade } from "@/lib/takeoff/drawingTakeoff";

type Props = {
  trade: TakeoffTrade;
  typeId: string;
  onTradeChange: (trade: TakeoffTrade) => void;
  onTypeChange: (typeId: string, defaultLabel: string) => void;
};

export function TradeTypeSelector({ trade, typeId, onTradeChange, onTypeChange }: Props) {
  const { t } = useI18n();
  const types = typesForTrade(trade);

  return (
    <div className="grid grid-cols-2 gap-3">
      <div className="space-y-1.5">
        <Label className="text-xs text-muted-foreground">{t("takeoff.field.trade")}</Label>
        <Select
          value={trade}
          onValueChange={(v) => {
            if (!v) return;
            onTradeChange(v as TakeoffTrade);
          }}
        >
          <SelectTrigger className="h-9 w-full text-sm">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {TAKEOFF_TRADES.map((tr) => (
              <SelectItem key={tr} value={tr}>
                {t(`takeoff.trade.${tr}`)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-1.5">
        <Label className="text-xs text-muted-foreground">{t("takeoff.field.type")}</Label>
        <Select
          value={typeId}
          onValueChange={(v) => {
            if (!v) return;
            const def = types.find((d) => d.id === v);
            onTypeChange(v, def ? t(def.labelKey) : v);
          }}
        >
          <SelectTrigger className="h-9 w-full text-sm">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {types.map((d) => (
              <SelectItem key={d.id} value={d.id}>
                {t(d.labelKey)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </div>
  );
}
