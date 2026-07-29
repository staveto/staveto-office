"use client";

import { useEffect, useMemo, useState } from "react";
import { Building2, Loader2, Plus, Search, User } from "lucide-react";
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
  listCustomersForWorkspace,
  type CustomerDoc,
  type CustomerType,
} from "@/lib/customers";
import {
  buildCreateCustomerInput,
  getCustomerContactPersonName,
  getCustomerDisplayName,
  projectCustomerFieldsFromDoc,
  projectCustomerFieldsFromNewInput,
  resolveCustomerType,
} from "@/lib/customerFields";
import { updateDraftJobFields } from "@/services/projects";
import type { ProjectDoc } from "@/lib/projects";
import { cn } from "@/lib/utils";

type Mode = "existing" | "new";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  project: ProjectDoc;
  userId: string;
  onProjectUpdated: (project: ProjectDoc) => void;
};

export function AssignProjectCustomerDialog({
  open,
  onOpenChange,
  project,
  userId,
  onProjectUpdated,
}: Props) {
  const { t } = useI18n();
  const { activeWorkspace } = useWorkspace();
  const [mode, setMode] = useState<Mode>("existing");
  const [customers, setCustomers] = useState<CustomerDoc[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<CustomerDoc | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const [customerType, setCustomerType] = useState<CustomerType>("person");
  const [name, setName] = useState("");
  const [contactPersonName, setContactPersonName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [fieldError, setFieldError] = useState<string | null>(null);

  const resetNewForm = () => {
    setCustomerType("person");
    setName("");
    setContactPersonName("");
    setEmail("");
    setPhone("");
    setFieldError(null);
  };

  useEffect(() => {
    if (!open || !activeWorkspace) return;
    let cancelled = false;
    setLoading(true);
    setLoadError(null);
    setSelected(null);
    setSearch("");
    setSaveError(null);
    resetNewForm();
    void listCustomersForWorkspace(activeWorkspace, userId)
      .then((list) => {
        if (cancelled) return;
        setCustomers(list);
        setMode(list.length === 0 ? "new" : "existing");
      })
      .catch(() => {
        if (!cancelled) {
          setCustomers([]);
          setLoadError(t("projects.new.contact.loadError"));
          setMode("new");
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open, activeWorkspace, userId, t]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return customers;
    return customers.filter((c) => {
      const hay = [
        getCustomerDisplayName(c),
        c.name,
        c.companyName,
        c.contactPersonName,
        c.email,
        c.phone,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return hay.includes(q);
    });
  }, [customers, search]);

  const applyCustomerFields = async (fields: ReturnType<typeof projectCustomerFieldsFromDoc>) => {
    const updated = await updateDraftJobFields(project.id, {
      customerId: fields.customerId,
      customerName: fields.customerName,
      customerCompanyName: fields.customerCompanyName,
      customerContactPersonName: fields.customerContactPersonName,
      customerEmail: fields.customerEmail,
      customerPhone: fields.customerPhone,
    });
    onProjectUpdated(updated);
    onOpenChange(false);
  };

  const handleConfirmExisting = async () => {
    if (!selected) return;
    setSaving(true);
    setSaveError(null);
    try {
      await applyCustomerFields(projectCustomerFieldsFromDoc(selected));
    } catch (e) {
      setSaveError(
        e instanceof Error ? e.message : t("projects.draft.quoteItem.saveError")
      );
    } finally {
      setSaving(false);
    }
  };

  const handleCreateAndAssign = async () => {
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
      const customerId = await createCustomer(activeWorkspace, userId, input);
      await applyCustomerFields(projectCustomerFieldsFromNewInput(customerId, input));
    } catch (e) {
      setSaveError(
        e instanceof Error ? e.message : t("projects.draft.quoteItem.saveError")
      );
    } finally {
      setSaving(false);
    }
  };

  const canSave =
    mode === "existing" ? Boolean(selected) : Boolean(name.trim()) && !saving;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg" data-testid="assign-project-customer-dialog">
        <DialogHeader>
          <DialogTitle>{t("projects.draft.quoteItem.openCustomer")}</DialogTitle>
        </DialogHeader>

        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            size="sm"
            variant={mode === "existing" ? "default" : "outline"}
            className={
              mode === "existing"
                ? "bg-[#e06737] hover:bg-[#c95a30] text-white"
                : undefined
            }
            onClick={() => {
              setMode("existing");
              setSaveError(null);
              setFieldError(null);
            }}
            data-testid="assign-customer-mode-existing"
          >
            {t("projects.new.contact.existing")}
          </Button>
          <Button
            type="button"
            size="sm"
            variant={mode === "new" ? "default" : "outline"}
            className={
              mode === "new"
                ? "bg-[#e06737] hover:bg-[#c95a30] text-white"
                : undefined
            }
            onClick={() => {
              setMode("new");
              setSelected(null);
              setSaveError(null);
            }}
            data-testid="assign-customer-mode-new"
          >
            <Plus className="size-3.5" aria-hidden />
            {t("projects.new.createCustomerCta")}
          </Button>
        </div>

        <div className="space-y-3 py-1">
          {mode === "existing" ? (
            <>
              <div>
                <Label htmlFor="assign-customer-search">
                  {t("projects.new.contact.existing")}
                </Label>
                <div className="relative mt-1">
                  <Search
                    className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
                    aria-hidden
                  />
                  <Input
                    id="assign-customer-search"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder={t("projects.new.contactSearchPlaceholder")}
                    className="pl-9"
                    autoFocus
                  />
                </div>
              </div>

              <div className="max-h-64 overflow-y-auto rounded-md border">
                {loading ? (
                  <div className="flex items-center gap-2 px-3 py-6 text-sm text-muted-foreground">
                    <Loader2 className="size-4 animate-spin" />
                    {t("common.loading")}
                  </div>
                ) : loadError ? (
                  <p className="px-3 py-4 text-sm text-amber-800" role="status">
                    {loadError}
                  </p>
                ) : customers.length === 0 ? (
                  <div className="space-y-3 px-3 py-4 text-center">
                    <p className="text-sm text-muted-foreground">
                      {t("projects.new.customersEmpty")}
                    </p>
                    <Button
                      type="button"
                      size="sm"
                      className="bg-[#e06737] hover:bg-[#c95a30] text-white"
                      onClick={() => setMode("new")}
                      data-testid="assign-customer-empty-create"
                    >
                      <Plus className="size-3.5" aria-hidden />
                      {t("projects.new.createCustomerCta")}
                    </Button>
                  </div>
                ) : filtered.length === 0 ? (
                  <p className="px-3 py-4 text-sm text-muted-foreground">
                    {t("projects.new.customerSearchEmpty")}
                  </p>
                ) : (
                  <ul
                    role="listbox"
                    aria-label={t("projects.draft.quoteItem.openCustomer")}
                  >
                    {filtered.map((c) => {
                      const isSelected = selected?.id === c.id;
                      const display = getCustomerDisplayName(c) || c.name;
                      const contact =
                        resolveCustomerType(c) === "company"
                          ? getCustomerContactPersonName(c)
                          : undefined;
                      const meta = [c.email, c.phone].filter(Boolean).join(" · ");
                      return (
                        <li key={c.id}>
                          <button
                            type="button"
                            role="option"
                            aria-selected={isSelected}
                            className={cn(
                              "flex w-full items-start gap-3 px-3 py-3 text-left text-sm hover:bg-muted/60",
                              isSelected &&
                                "bg-[#FFF1E8] ring-1 ring-inset ring-[#e06737]/40"
                            )}
                            onClick={() => setSelected(c)}
                          >
                            <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground">
                              {resolveCustomerType(c) === "company" ? (
                                <Building2 className="size-4" aria-hidden />
                              ) : (
                                <User className="size-4" aria-hidden />
                              )}
                            </span>
                            <span className="min-w-0 flex-1">
                              <span className="block truncate font-medium text-foreground">
                                {display}
                              </span>
                              {contact ? (
                                <span className="block truncate text-muted-foreground">
                                  {contact}
                                </span>
                              ) : null}
                              {meta ? (
                                <span className="block truncate text-xs text-muted-foreground">
                                  {meta}
                                </span>
                              ) : null}
                            </span>
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
            </>
          ) : (
            <div className="space-y-3">
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
                  <Label htmlFor="assign-customer-name">
                    {t("projects.new.customerPersonName")} *
                  </Label>
                  <Input
                    id="assign-customer-name"
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
                    <Label htmlFor="assign-company-name">
                      {t("projects.new.customerCompanyName")} *
                    </Label>
                    <Input
                      id="assign-company-name"
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
                    <Label htmlFor="assign-contact-person">
                      {t("projects.new.customerContactPerson")} *
                    </Label>
                    <Input
                      id="assign-contact-person"
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
                  <Label htmlFor="assign-customer-email">
                    {t("projects.new.customerEmail")}
                  </Label>
                  <Input
                    id="assign-customer-email"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="mt-1"
                  />
                </div>
                <div>
                  <Label htmlFor="assign-customer-phone">
                    {t("projects.new.customerPhone")}
                  </Label>
                  <Input
                    id="assign-customer-phone"
                    type="tel"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    className="mt-1"
                  />
                </div>
              </div>
            </div>
          )}

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
            disabled={!canSave || saving}
            className="bg-[#e06737] hover:bg-[#c95a30] text-white"
            onClick={() =>
              void (mode === "existing" ? handleConfirmExisting() : handleCreateAndAssign())
            }
            data-testid="assign-project-customer-confirm"
          >
            {saving ? (
              <Loader2 className="size-4 animate-spin" />
            ) : mode === "new" ? (
              t("projects.new.createCustomerCta")
            ) : (
              t("common.save")
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
