"use client";

import { useI18n } from "@/i18n/I18nContext";
import { Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type Props = {
  open: boolean;
  onClick: () => void;
  className?: string;
  disabled?: boolean;
  title?: string;
};

export function ManagerAgentButton({ open, onClick, className, disabled, title }: Props) {
  const { t } = useI18n();
  return (
    <Button
      type="button"
      aria-expanded={open}
      aria-label={t("agent.title")}
      title={title}
      disabled={disabled}
      onClick={onClick}
      className={cn(
        "size-14 rounded-full shadow-lg",
        "bg-[#1D376A] hover:bg-[#152a52] text-white",
        open && "ring-2 ring-[#E95F2A] ring-offset-2",
        disabled && "opacity-60 cursor-not-allowed",
        className
      )}
    >
      <Sparkles className="size-6" aria-hidden />
    </Button>
  );
}
