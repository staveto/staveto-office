"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, Loader2 } from "lucide-react";
import { useI18n } from "@/i18n/I18nContext";
import { useAuth } from "@/context/AuthContext";
import { useWorkspace } from "@/context/WorkspaceContext";
import { useWorkspaceProduct } from "@/hooks/useWorkspaceProduct";
import { useEnabledModules } from "@/context/EnabledModulesContext";
import { isModuleEnabled } from "@/lib/enabledModules";
import { buttonVariants } from "@/components/ui/button";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
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
      await createExpense(projectId, user.id, payload);
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

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <Link href="/app/expenses" className={buttonVariants({ variant: "ghost", size: "sm" })}>
        <ArrowLeft className="size-4 mr-2" />
        {t("expenses.backToOverview")}
      </Link>

      <Card>
        <CardHeader>
          <CardTitle>{t("expenses.new")}</CardTitle>
        </CardHeader>
        <CardContent>
          {loadingProjects ? (
            <div className="flex justify-center py-8">
              <Loader2 className="size-6 animate-spin text-muted-foreground" />
            </div>
          ) : writableProjects.length === 0 ? (
            <p className="text-muted-foreground text-center py-8">{t("expenses.noWritableProjects")}</p>
          ) : (
            <form onSubmit={(e) => void handleSubmit(e)} className="space-y-6">
              <div>
                <Label htmlFor="exp-project">{t("expenses.project")} *</Label>
                <Select value={projectId} onValueChange={(v) => setProjectId(v ?? "")}>
                  <SelectTrigger id="exp-project">
                    <SelectValue placeholder={t("expenses.selectProject")} />
                  </SelectTrigger>
                  <SelectContent>
                    {writableProjects.map((p) => (
                      <SelectItem key={p.id} value={p.id}>
                        {p.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <ExpenseForm values={formValues} onChange={setFormValues} idPrefix="new-exp" />

              {error && <p className="text-sm text-destructive">{error}</p>}

              <div className="flex gap-2 justify-end">
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
