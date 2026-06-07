"use client";

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useI18n } from "@/i18n/I18nContext";
import { InviteCodeResultPanel } from "@/components/members/InviteCodeResultPanel";
import type { CreateBusinessInviteCodeResult } from "@/services/business/businessInvitesService";

type InviteCodeViewDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  result: CreateBusinessInviteCodeResult | null;
  email?: string | null;
  legacy?: boolean;
};

export function InviteCodeViewDialog({
  open,
  onOpenChange,
  result,
  email,
  legacy = false,
}: InviteCodeViewDialogProps) {
  const { t } = useI18n();

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{t("members.invites.viewCodeTitle")}</DialogTitle>
        </DialogHeader>

        {result ? (
          <div className="py-2 space-y-3">
            {email ? (
              <p className="text-sm text-muted-foreground">
                {t("members.invites.viewCodeForEmail", { email })}
              </p>
            ) : null}
            <InviteCodeResultPanel
              result={result}
              showQr
              hideCode={legacy || !result.code}
              emailHint={email && !legacy ? email : undefined}
            />
          </div>
        ) : (
          <p className="py-4 text-sm text-muted-foreground">
            {t("members.invites.codeUnavailable")}
          </p>
        )}

        <DialogFooter>
          <Button type="button" onClick={() => onOpenChange(false)}>
            {t("members.invites.done")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
