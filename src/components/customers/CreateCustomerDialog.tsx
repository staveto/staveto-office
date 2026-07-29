"use client";

import { useEffect, useState } from "react";
import { Building2, Loader2, User } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useI18n } from "@/i18n/I18nContext";
import { useWorkspace } from "@/context/WorkspaceContext";
import {
  createCustomer,
  type CustomerDoc,
  type CustomerType,
} from "@/lib/customers";
import { buildCreateCustomerInput } from "@/lib/customerFields";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  userId: string;
  onCreated: (customer: CustomerDoc) => void;
};

export function CreateCustomerDialog({
  open,
  onOpenChange,
  userId,
  onCreated,
}: Props) {
  const { t } = useI18n();
  const { activeWorkspace } = useWorkspace();
  const [customerType, setCustomerType] = useState<CustomerType>("person");
  const [name, setName] = useState("");
  const [contactPersonName, setContactPersonName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [fieldError, setFieldError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setCustomerType("person");
    setName("");
    setContactPersonName("");
    setEmail("");
    setPhone("");
    setFieldError(null);
    setSaveError(null);
  }, [open]);

  const handleCreate = async () => {
    if (!activeWorkspace) return;
    const trimmedName = name.trim();
    if (!trimmedName) {
      setFieldError(
        customerType === "company"
          ? t("projects.new.customerCompanyName")
          : t("projects.new.customerPersonName")
      );
      return;
    }
    if (customerType === "company" && !contactPersonName.trim()) {
      setFieldError(t("projects.new.customerContactPerson"));
      return;
    }

    setSaving(true);
    setSaveError(null);
    setFieldError(null);
    try {
      const input = buildCreateCustomerInput({
        type: customerType,
        personName: customerType === "person" ? trimmedName : undefined,
        companyName: customerType === "company" ? trimmedName : undefined,
        contactPersonName:
          customerType === "company" ? contactPersonName.trim() : undefined,
        email: email.trim() || undefined,
        phone: phone.trim() || undefined,
      });
      const id = await createCustomer(activeWorkspace, userId, input);
      onCreated({
        id,
        name: input.name,
        type: input.type,
        customerType: input.type,
        companyName: input.companyName,
        contactPersonName: input.contactPersonName,
        email: input.email,
        phone: input.phone,
      });
      onOpenChange(false);
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : t("customers.saveError"));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg" data-testid="create-customer-dialog">
        <DialogHeader>
          <DialogTitle>{t("customers.createTitle")}</DialogTitle>
        </DialogHeader>

        <div className="space-y-3 py-1">
          <div className="space-y-2">
            <Label>{t("projects.new.customerTypeLabel")}</Label>
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                size="sm"
                variant={customerType === "person" ? "default" : "outline"}
                className={
                  customerType === "person"
                    ? "bg-[#e06737] hover:bg-[#c95a30] text-white"
                    : undefined
                }
                onClick={() => {
                  setCustomerType("person");
                  setFieldError(null);
                }}
              >
                <User className="size-3.5" aria-hidden />
                {t("projects.new.customerType.person")}
              </Button>
              <Button
                type="button"
                size="sm"
                variant={customerType === "company" ? "default" : "outline"}
                className={
                  customerType === "company"
                    ? "bg-[#e06737] hover:bg-[#c95a30] text-white"
                    : undefined
                }
                onClick={() => {
                  setCustomerType("company");
                  setFieldError(null);
                }}
              >
                <Building2 className="size-3.5" aria-hidden />
                {t("projects.new.customerType.company")}
              </Button>
            </div>
          </div>

          {customerType === "person" ? (
            <div>
              <Label htmlFor="create-customer-name">
                {t("projects.new.customerPersonName")} *
              </Label>
              <Input
                id="create-customer-name"
                value={name}
                onChange={(e) => {
                  setName(e.target.value);
                  setFieldError(null);
                }}
                className="mt-1"
                autoFocus
              />
            </div>
          ) : (
            <>
              <div>
                <Label htmlFor="create-company-name">
                  {t("projects.new.customerCompanyName")} *
                </Label>
                <Input
                  id="create-company-name"
                  value={name}
                  onChange={(e) => {
                    setName(e.target.value);
                    setFieldError(null);
                  }}
                  className="mt-1"
                  autoFocus
                />
              </div>
              <div>
                <Label htmlFor="create-contact-person">
                  {t("projects.new.customerContactPerson")} *
                </Label>
                <Input
                  id="create-contact-person"
                  value={contactPersonName}
                  onChange={(e) => {
                    setContactPersonName(e.target.value);
                    setFieldError(null);
                  }}
                  className="mt-1"
                />
              </div>
            </>
          )}

          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <Label htmlFor="create-customer-email">
                {t("projects.new.customerEmail")}
              </Label>
              <Input
                id="create-customer-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="mt-1"
              />
            </div>
            <div>
              <Label htmlFor="create-customer-phone">
                {t("projects.new.customerPhone")}
              </Label>
              <Input
                id="create-customer-phone"
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                className="mt-1"
              />
            </div>
          </div>

          {fieldError ? (
            <p className="text-sm text-destructive" role="alert">
              {fieldError}
            </p>
          ) : null}
          {saveError ? (
            <p className="text-sm text-destructive" role="alert">
              {saveError}
            </p>
          ) : null}
        </div>

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={saving}
          >
            {t("common.cancel")}
          </Button>
          <Button
            type="button"
            disabled={saving || !name.trim()}
            className="bg-[#e06737] hover:bg-[#c95a30] text-white"
            onClick={() => void handleCreate()}
            data-testid="create-customer-confirm"
          >
            {saving ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              t("customers.create")
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
