"use client";

import { UserPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useI18n } from "@/i18n/I18nContext";

type TeamFirstInviteCardProps = {
  onInvite: () => void;
  disabled?: boolean;
};

export function TeamFirstInviteCard({ onInvite, disabled }: TeamFirstInviteCardProps) {
  const { t } = useI18n();

  return (
    <section className="rounded-2xl border border-[#1D376A]/15 bg-gradient-to-br from-[#1D376A]/[0.06] to-transparent p-6 ring-1 ring-[#1D376A]/10">
      <h2 className="text-lg font-semibold text-[#1D376A]">
        {t("members.firstInvite.title")}
      </h2>
      <p className="mt-2 max-w-xl text-sm leading-relaxed text-muted-foreground">
        {t("members.firstInvite.description")}
      </p>
      <p className="mt-2 text-xs text-muted-foreground">
        {t("members.firstInvite.hint")}
      </p>
      <Button
        type="button"
        className="mt-4 bg-[#e06737] hover:bg-[#e06737]/90"
        onClick={onInvite}
        disabled={disabled}
      >
        <UserPlus className="size-4 mr-2" aria-hidden />
        {t("members.firstInvite.cta")}
      </Button>
    </section>
  );
}
