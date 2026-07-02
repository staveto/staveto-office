"use client";

import { Button } from "@/components/ui/button";
import { useI18n } from "@/i18n/I18nContext";
import type { ManagerAgentDisplayMode } from "@/lib/agent/managerAgentDisplay";
import { cn } from "@/lib/utils";

type Props = {
  mode: ManagerAgentDisplayMode;
  onModeChange: (mode: ManagerAgentDisplayMode) => void;
  onSnooze: () => void;
  onHideOnScreen: () => void;
  onTurnOff: () => void;
};

const MODE_OPTIONS: ManagerAgentDisplayMode[] = ["off", "minimized", "proactive", "open"];

export function ManagerAgentModeControls({
  mode,
  onModeChange,
  onSnooze,
  onHideOnScreen,
  onTurnOff,
}: Props) {
  const { t } = useI18n();

  return (
    <div className="space-y-3 border-t border-[#E2E8F0] px-4 py-3">
      <div>
        <p className="text-xs font-semibold uppercase tracking-wide text-[#64748B]">
          {t("agent.mode.label")}
        </p>
        <div className="mt-2 flex flex-wrap gap-2">
          {MODE_OPTIONS.map((option) => (
            <Button
              key={option}
              type="button"
              size="sm"
              variant={mode === option ? "default" : "outline"}
              className={cn(mode === option && "bg-[#1D376A] hover:bg-[#152a52]")}
              onClick={() => onModeChange(option)}
            >
              {t(`agent.mode.${option}`)}
            </Button>
          ))}
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        <Button type="button" size="sm" variant="outline" onClick={onSnooze}>
          {t("agent.snoozeOneHour")}
        </Button>
        <Button type="button" size="sm" variant="outline" onClick={onHideOnScreen}>
          {t("agent.hideOnScreen")}
        </Button>
        <Button type="button" size="sm" variant="ghost" onClick={onTurnOff}>
          {t("agent.turnOff")}
        </Button>
      </div>
    </div>
  );
}
