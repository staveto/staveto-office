"use client";

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Loader2, RefreshCw } from "lucide-react";
import { useI18n } from "@/i18n/I18nContext";
import { InviteCodeResultPanel } from "@/components/members/InviteCodeResultPanel";
import type { CreateBusinessInviteCodeResult } from "@/services/business/businessInvitesService";

type InviteCodeViewDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  result: CreateBusinessInviteCodeResult | null;
  email?: string | null;
  legacy?: boolean;
  loading?: boolean;
  errorKey?: string | null;
  canRegenerate?: boolean;
  onRegenerate?: () => void;
};

export function InviteCodeViewDialog({
  open,
  onOpenChange,
  result,
  email,
  legacy = false,
  loading = false,
  errorKey = null,
  canRegenerate = false,
  onRegenerate,
}: InviteCodeViewDialogProps) {
  const { t } = useI18n();

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{t("members.invites.viewCodeTitle")}</DialogTitle>
        </DialogHeader>

        {loading ? (
          <div className="py-8 flex flex-col items-center gap-3">
            <Loader2 className="size-8 animate-spin text-primary" />
            <p className="text-sm text-muted-foreground">
              {t("members.invites.loadingCode")}
            </p>
          </div>
        ) : result ? (
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
          <div className="py-2 space-y-4">
            <p className="text-sm text-muted-foreground">
              {t("members.invites.codeUnavailable")}
            </p>
            {errorKey ? (
              <p
                className="rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive"
                role="alert"
              >
                {t(errorKey)}
              </p>
            ) : null}
            {canRegenerate && onRegenerate ? (
              <Button
                type="button"
                size="lg"
                className="w-full gap-2"
                disabled={loading}
                onClick={onRegenerate}
              >
                <RefreshCw className="size-4" />
                {t("members.invites.regenerateCode")}
              </Button>
            ) : null}
          </div>
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
