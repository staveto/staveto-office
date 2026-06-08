"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useI18n } from "@/i18n/I18nContext";
import { useAuth } from "@/context/AuthContext";
import { useWorkspaceProduct } from "@/hooks/useWorkspaceProduct";
import type { ProjectDoc } from "@/lib/projects";
import {
  FirestoreIndexError,
  listProjectExpenses,
  createExpense,
  updateExpense,
  deleteExpense,
  sumReadyExpenses,
  canEditProjectExpenses,
  expenseSupplierLabel,
  formatExpenseDate,
  type ExpenseDoc,
} from "@/lib/expenses";
import { ExpenseStatusBadge } from "@/components/expenses/ExpenseStatusBadge";
import {
  ExpenseForm,
  EMPTY_EXPENSE_FORM,
  expenseDocToFormValues,
  expenseFormToPayload,
  isExpenseFormValid,
  type ExpenseFormValues,
} from "@/components/expenses/ExpenseForm";
import { Loader2, Pencil, Plus, Trash2 } from "lucide-react";

type ProjectExpensesPanelProps = {
  project: ProjectDoc;
};

export function ProjectExpensesPanel({ project }: ProjectExpensesPanelProps) {
  const { t } = useI18n();
  const { user } = useAuth();
  const { role } = useWorkspaceProduct();

  const [expenses, setExpenses] = useState<ExpenseDoc[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingExpense, setEditingExpense] = useState<ExpenseDoc | null>(null);
  const [formValues, setFormValues] = useState<ExpenseFormValues>(EMPTY_EXPENSE_FORM);
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const canEdit = !!user?.id && canEditProjectExpenses(project, user.id, role);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const list = await listProjectExpenses(project.id);
      setExpenses(list);
    } catch (e) {
      setError(e instanceof FirestoreIndexError ? e.message : t("expenses.loadError"));
      setExpenses([]);
    } finally {
      setLoading(false);
    }
  }, [project.id, t]);

  useEffect(() => {
    void load();
  }, [load]);

  const readyTotal = useMemo(() => sumReadyExpenses(expenses), [expenses]);
  const currency = expenses.find((e) => e.currency)?.currency ?? "EUR";

  const openAdd = () => {
    setEditingExpense(null);
    setFormValues(EMPTY_EXPENSE_FORM);
    setModalOpen(true);
  };

  const openEdit = (exp: ExpenseDoc) => {
    setEditingExpense(exp);
    setFormValues(expenseDocToFormValues(exp));
    setModalOpen(true);
  };

  const handleSave = async () => {
    if (!user?.id || !isExpenseFormValid(formValues)) return;
    setSaving(true);
    try {
      const payload = expenseFormToPayload(formValues);
      if (editingExpense) {
        await updateExpense(project.id, editingExpense.id, payload);
        setExpenses((prev) =>
          prev.map((e) =>
            e.id === editingExpense.id
              ? {
                  ...e,
                  title: payload.title,
                  amount: payload.amount,
                  currency: payload.currency ?? e.currency,
                  date: payload.date,
                  category: payload.category,
                  note: payload.note,
                  supplierName: payload.supplierName,
                  supplierIco: payload.supplierIco,
                  travel: payload.travel ?? undefined,
                  status: e.status ?? "READY",
                }
              : e
          )
        );
      } else {
        const id = await createExpense(project.id, user.id, payload);
        setExpenses((prev) => [
          {
            id,
            projectId: project.id,
            title: payload.title,
            amount: payload.amount,
            currency: payload.currency ?? "EUR",
            date: payload.date,
            category: payload.category,
            note: payload.note,
            supplierName: payload.supplierName,
            supplierIco: payload.supplierIco,
            travel: payload.travel ?? undefined,
            status: "READY",
            source: "MANUAL",
          },
          ...prev,
        ]);
      }
      setModalOpen(false);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (exp: ExpenseDoc) => {
    if (!confirm(t("projects.expenseConfirmDelete"))) return;
    setDeletingId(exp.id);
    try {
      await deleteExpense(project.id, exp.id);
      setExpenses((prev) => prev.filter((e) => e.id !== exp.id));
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <>
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-base">{t("projects.tabExpenses")}</CardTitle>
          {canEdit && (
            <Button size="sm" onClick={openAdd}>
              <Plus className="size-4 mr-2" />
              {t("projects.addExpense")}
            </Button>
          )}
        </CardHeader>
        <CardContent className="p-0">
          {loading && (
            <div className="flex justify-center py-12">
              <Loader2 className="size-6 animate-spin text-muted-foreground" />
            </div>
          )}

          {!loading && error && (
            <div className="px-4 py-2">
              <p className="text-sm text-destructive">{error}</p>
            </div>
          )}

          {!loading && !error && expenses.length === 0 && (
            <div className="py-12 text-center">
              <p className="text-muted-foreground">{t("projects.expensesEmpty")}</p>
              {canEdit && (
                <Button variant="outline" size="sm" className="mt-4" onClick={openAdd}>
                  <Plus className="size-4 mr-2" />
                  {t("projects.addExpense")}
                </Button>
              )}
            </div>
          )}

          {!loading && !error && expenses.length > 0 && (
            <>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t("projects.expenseDate")}</TableHead>
                    <TableHead>{t("estimates.titleCol")}</TableHead>
                    <TableHead className="hidden md:table-cell">{t("projects.expenseCategory")}</TableHead>
                    <TableHead className="hidden lg:table-cell">{t("expenses.supplierName")}</TableHead>
                    <TableHead>{t("estimates.totalCol")}</TableHead>
                    <TableHead>{t("expenses.statusLabel")}</TableHead>
                    {canEdit && <TableHead className="w-[80px]" />}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {expenses.map((exp) => (
                    <TableRow key={exp.id}>
                      <TableCell className="text-muted-foreground whitespace-nowrap">
                        {formatExpenseDate(exp.date)}
                      </TableCell>
                      <TableCell>{exp.title || t("projects.noName")}</TableCell>
                      <TableCell className="hidden md:table-cell text-muted-foreground">
                        {exp.category ? t(`projects.expenseCategory.${exp.category}`) : "—"}
                      </TableCell>
                      <TableCell className="hidden lg:table-cell text-muted-foreground">
                        {expenseSupplierLabel(exp) ?? "—"}
                      </TableCell>
                      <TableCell className="tabular-nums whitespace-nowrap">
                        {exp.amount != null ? `${exp.amount.toFixed(2)} ${exp.currency}` : "—"}
                      </TableCell>
                      <TableCell>
                        <ExpenseStatusBadge status={exp.status} />
                      </TableCell>
                      {canEdit && (
                        <TableCell>
                          <div className="flex gap-1">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => openEdit(exp)}
                              title={t("common.edit")}
                              className="p-0 h-8 w-8"
                              disabled={exp.status === "PROCESSING"}
                            >
                              <Pencil className="size-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => void handleDelete(exp)}
                              disabled={deletingId === exp.id}
                              title={t("common.delete")}
                              className="p-0 h-8 w-8"
                            >
                              {deletingId === exp.id ? (
                                <Loader2 className="size-4 animate-spin" />
                              ) : (
                                <Trash2 className="size-4 text-destructive" />
                              )}
                            </Button>
                          </div>
                        </TableCell>
                      )}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              <div className="border-t px-4 py-3 font-medium">
                {t("projects.expensesTotal")} ({t("expenses.readyOnly")}): {readyTotal.toFixed(2)}{" "}
                {currency}
              </div>
            </>
          )}
        </CardContent>
      </Card>

      <Dialog open={modalOpen} onOpenChange={setModalOpen}>
        <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {editingExpense ? t("projects.editExpense") : t("projects.addExpense")}
            </DialogTitle>
          </DialogHeader>
          <ExpenseForm values={formValues} onChange={setFormValues} />
          <DialogFooter>
            <Button variant="outline" onClick={() => setModalOpen(false)}>
              {t("common.cancel")}
            </Button>
            <Button onClick={() => void handleSave()} disabled={saving || !isExpenseFormValid(formValues)}>
              {saving ? <Loader2 className="size-4 animate-spin" /> : t("common.save")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
