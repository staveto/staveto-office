"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, Loader2, ReceiptText, Car } from "lucide-react";
import { useI18n } from "@/i18n/I18nContext";
import { useAuth } from "@/context/AuthContext";
import { useWorkspace } from "@/context/WorkspaceContext";
import { useWorkspaceProduct } from "@/hooks/useWorkspaceProduct";
import { useEnabledModules } from "@/context/EnabledModulesContext";
import { isModuleEnabled } from "@/lib/enabledModules";
import { buttonVariants } from "@/components/ui/button";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { listProjectsForWorkspace, type ProjectDoc } from "@/lib/projects";
import { createExpense, canEditProjectExpenses, canWriteExpenses } from "@/lib/expenses";
import {
  ExpenseForm,
  EMPTY_EXPENSE_FORM,
  expenseFormToPayload,
  isExpenseFormValid,
  type ExpenseFormValues,
} from "@/components/expenses/ExpenseForm";
import { InvoiceScanButton, type InvoiceScanResult } from "@/components/expenses/InvoiceScanButton";

export default function NewExpensePage() {
  const router = useRouter();
  const { t } = useI18n();
  const { user } = useAuth();
  const { activeWorkspace } = useWorkspace();
  const { isCompany, role } = useWorkspaceProduct();
  const { modules } = useEnabledModules();

  const [projects, setProjects] = useState<ProjectDoc[]>([]);
  const [loadingProjects, setLoadingProjects] = useState(true);
  const [projectId, setProjectId] = useState("");
  const [formValues, setFormValues] = useState<ExpenseFormValues>(EMPTY_EXPENSE_FORM);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ocrMeta, setOcrMeta] = useState<InvoiceScanResult["meta"] | null>(null);
  const [ocrFields, setOcrFields] = useState<InvoiceScanResult["fields"] | null>(null);
  const [mode, setMode] = useState<"invoice" | "travel">("invoice");

  const switchMode = (next: "invoice" | "travel") => {
    if (next === mode) return;
    setMode(next);
    setFormValues((prev) => ({
      ...prev,
      category: next === "travel" ? "TRAVEL" : prev.category === "TRAVEL" ? "MATERIAL" : prev.category,
    }));
  };

  const handleScanned = ({ fields, meta }: InvoiceScanResult) => {
    setOcrMeta(meta);
    setOcrFields(fields);
    setFormValues((prev) => ({
      ...prev,
      title: prev.title || fields.supplierName || fields.invoiceNumber || prev.title,
      amount: fields.totalAmount != null ? String(fields.totalAmount) : prev.amount,
      currency: fields.currency || prev.currency,
      date: fields.issueDate || prev.date,
      category: prev.category === "TRAVEL" ? "MATERIAL" : prev.category,
      supplierName: fields.supplierName || prev.supplierName,
      supplierIco: fields.supplierIco || prev.supplierIco,
    }));
  };

  const moduleEnabled = isCompany ? isModuleEnabled(modules, "expenses") : true;
  const canAdd = canWriteExpenses(role);

  const writableProjects = useMemo(() => {
    if (!user?.id) return [];
    return projects.filter((p) => canEditProjectExpenses(p, user.id, role));
  }, [projects, user?.id, role]);

  useEffect(() => {
    if (!user?.id || !activeWorkspace) {
      setLoadingProjects(false);
      return;
    }
    let cancelled = false;
    void (async () => {
      setLoadingProjects(true);
      try {
        const list = await listProjectsForWorkspace(activeWorkspace, user.id);
        if (!cancelled) {
          setProjects(list);
          const writable = list.filter((p) => canEditProjectExpenses(p, user.id, role));
          if (writable.length === 1) setProjectId(writable[0].id);
        }
      } finally {
        if (!cancelled) setLoadingProjects(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [user?.id, activeWorkspace, role]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user?.id || !projectId || !isExpenseFormValid(formValues)) return;
    setSaving(true);
    setError(null);
    try {
      const payload = expenseFormToPayload(formValues);
      const isScanned = !!ocrMeta && mode === "invoice";
      await createExpense(projectId, user.id, {
        ...payload,
        ...(isScanned
          ? {
              source: "DOCUMENT" as const,
              filePath: ocrMeta?.filePath,
              mimeType: ocrMeta?.mimeType,
              ocrInvoiceNumber: ocrFields?.invoiceNumber ?? null,
              ocrIssueDate: ocrFields?.issueDate ?? null,
              ocrTotalAmount: ocrFields?.totalAmount ?? null,
              ocrVatAmount: ocrFields?.vatAmount ?? null,
              ocrCurrency: ocrFields?.currency ?? null,
              ocrSupplierName: ocrFields?.supplierName ?? null,
            }
          : {}),
      });
      router.push("/app/expenses");
    } catch (err) {
      setError(err instanceof Error ? err.message : t("expenses.saveError"));
    } finally {
      setSaving(false);
    }
  };

  if (isCompany && !moduleEnabled) {
    return (
      <Card>
        <CardContent className="py-12 text-center text-muted-foreground">
          {t("expenses.moduleDisabled")}
        </CardContent>
      </Card>
    );
  }

  if (!canAdd) {
    return (
      <Card>
        <CardContent className="py-12 text-center text-muted-foreground">
          {t("expenses.readOnlyHint")}
        </CardContent>
      </Card>
    );
  }

  const typeOptions = [
    {
      id: "invoice" as const,
      label: t("expenses.typeInvoice"),
      desc: t("expenses.typeInvoiceDesc"),
      Icon: ReceiptText,
    },
    {
      id: "travel" as const,
      label: t("expenses.typeTravel"),
      desc: t("expenses.typeTravelDesc"),
      Icon: Car,
    },
  ];

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div className="space-y-3">
        <Link
          href="/app/expenses"
          className={buttonVariants({ variant: "ghost", size: "sm" }) + " -ml-2 w-fit text-muted-foreground"}
        >
          <ArrowLeft className="size-4 mr-1.5" />
          {t("expenses.backToOverview")}
        </Link>
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{t("expenses.new")}</h1>
          <p className="text-sm text-muted-foreground">{t("expenses.newSubtitle")}</p>
        </div>
      </div>

      <Card className="overflow-hidden rounded-2xl border-border/70 shadow-sm">
        <CardContent className="p-0">
          {loadingProjects ? (
            <div className="flex justify-center py-16">
              <Loader2 className="size-6 animate-spin text-muted-foreground" />
            </div>
          ) : writableProjects.length === 0 ? (
            <p className="text-muted-foreground text-center py-16">{t("expenses.noWritableProjects")}</p>
          ) : (
            <form onSubmit={(e) => void handleSubmit(e)}>
              <div className="space-y-8 p-6">
                {/* Type selection */}
                <section className="space-y-3">
                  <Label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    {t("expenses.typeLabel")}
                  </Label>
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    {typeOptions.map(({ id, label, desc, Icon }) => {
                      const active = mode === id;
                      return (
                        <button
                          key={id}
                          type="button"
                          onClick={() => switchMode(id)}
                          aria-pressed={active}
                          className={`flex items-start gap-3 rounded-xl border p-4 text-left transition-all ${
                            active
                              ? "border-primary bg-primary/5 ring-1 ring-primary/30"
                              : "border-border hover:border-foreground/30 hover:bg-muted/40"
                          }`}
                        >
                          <span
                            className={`flex size-9 shrink-0 items-center justify-center rounded-lg transition-colors ${
                              active
                                ? "bg-primary text-primary-foreground"
                                : "bg-muted text-muted-foreground"
                            }`}
                          >
                            <Icon className="size-5" />
                          </span>
                          <span>
                            <span className="block text-sm font-semibold">{label}</span>
                            <span className="mt-0.5 block text-xs leading-snug text-muted-foreground">
                              {desc}
                            </span>
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </section>

                {/* Project */}
                <section className="space-y-2">
                  <Label
                    htmlFor="exp-project"
                    className="text-xs font-semibold uppercase tracking-wide text-muted-foreground"
                  >
                    {t("expenses.project")} *
                  </Label>
                  <Select value={projectId} onValueChange={(v) => setProjectId(v ?? "")}>
                    <SelectTrigger
                      id="exp-project"
                      className="h-10 w-full border-foreground/20 bg-background shadow-sm"
                    >
                      <SelectValue placeholder={t("expenses.selectProject")}>
                        {(value: string | null) => {
                          const selected = writableProjects.find((p) => p.id === value);
                          return selected?.name?.trim() || t("expenses.selectProject");
                        }}
                      </SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                      {writableProjects.map((p) => (
                        <SelectItem key={p.id} value={p.id}>
                          {p.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </section>

                {mode === "invoice" && (
                  <section>
                    <InvoiceScanButton
                      projectId={projectId}
                      disabled={!projectId}
                      onParsed={handleScanned}
                    />
                  </section>
                )}

                {/* Details */}
                <section className="space-y-4">
                  <Label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    {t("expenses.detailsSection")}
                  </Label>
                  <ExpenseForm
                    values={formValues}
                    onChange={setFormValues}
                    idPrefix="new-exp"
                    mode={mode}
                  />
                </section>

                {error && (
                  <p className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">
                    {error}
                  </p>
                )}
              </div>

              <div className="flex items-center justify-end gap-2 border-t border-border/70 bg-muted/30 px-6 py-4">
                <Link href="/app/expenses" className={buttonVariants({ variant: "outline" })}>
                  {t("common.cancel")}
                </Link>
                <Button
                  type="submit"
                  disabled={saving || !projectId || !isExpenseFormValid(formValues)}
                >
                  {saving ? <Loader2 className="size-4 animate-spin" /> : t("common.save")}
                </Button>
              </div>
            </form>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
