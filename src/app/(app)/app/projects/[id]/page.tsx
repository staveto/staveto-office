"use client";

import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import Link from "next/link";
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
import { Badge } from "@/components/ui/badge";
import { useI18n } from "@/i18n/I18nContext";
import { useAuth } from "@/context/AuthContext";
import {
  listProjectTasks,
  listProjectExpenses,
  createTask,
  createExpense,
  updateExpense,
  deleteExpense,
  updateTaskStatus,
  hasProjectAccess,
  FirestoreIndexError,
  type ProjectDoc,
  type TaskDoc,
  type ExpenseDoc,
  type ExpenseCategory,
} from "@/lib/projects";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { ArrowLeft, CheckCircle2, Circle, Loader2, Plus, Pencil, Trash2 } from "lucide-react";
import { isDraftJob } from "@/lib/projectLifecycle";
import { DraftJobWorkspace } from "@/components/jobs/DraftJobWorkspace";
import { JobLifecycleBadge } from "@/components/jobs/JobLifecycleBadge";
import { WorkTypeBadge } from "@/components/jobs/WorkTypeBadge";
import { ProjectOwnershipBadge } from "@/components/projects/ProjectOwnershipBadge";
import { ProjectOwnershipMeta } from "@/components/projects/ProjectOwnershipMeta";

const EXPENSE_CATEGORIES: ExpenseCategory[] = ["MATERIAL", "WORK", "OTHER", "TRAVEL"];

type TabId = "overview" | "tasks" | "expenses";

function ProjectDetailSkeleton() {
  return (
    <div className="space-y-6">
      <div className="h-8 w-48 rounded bg-muted/50 animate-pulse" />
      <div className="h-64 rounded-xl bg-muted/50 animate-pulse" />
    </div>
  );
}

export default function ProjectDetailPage() {
  const params = useParams();
  const { t } = useI18n();
  const { user } = useAuth();
  const id = params.id as string;

  const [project, setProject] = useState<ProjectDoc | null>(null);
  const [tasks, setTasks] = useState<TaskDoc[]>([]);
  const [expenses, setExpenses] = useState<ExpenseDoc[]>([]);
  const [loading, setLoading] = useState(true);
  const [accessDenied, setAccessDenied] = useState(false);
  const [activeTab, setActiveTab] = useState<TabId>("overview");
  const [togglingTaskId, setTogglingTaskId] = useState<string | null>(null);
  const [newTaskTitle, setNewTaskTitle] = useState("");
  const [addingTask, setAddingTask] = useState(false);
  const [tasksError, setTasksError] = useState<string | null>(null);
  const [expensesError, setExpensesError] = useState<string | null>(null);
  const [expenseModalOpen, setExpenseModalOpen] = useState(false);
  const [editingExpense, setEditingExpense] = useState<ExpenseDoc | null>(null);
  const [expenseForm, setExpenseForm] = useState({
    title: "",
    amount: "",
    currency: "EUR",
    date: new Date().toISOString().slice(0, 10),
    category: "OTHER" as ExpenseCategory,
    note: "",
  });
  const [savingExpense, setSavingExpense] = useState(false);
  const [deletingExpenseId, setDeletingExpenseId] = useState<string | null>(null);

  useEffect(() => {
    if (!id || !user?.id) return;

    let cancelled = false;

    async function load() {
      setLoading(true);
      setAccessDenied(false);
      try {
        const { allowed, project: p } = await hasProjectAccess(id, user!.id);
        if (cancelled) return;
        if (!allowed || !p) {
          setAccessDenied(true);
          setProject(null);
          setTasks([]);
          setExpenses([]);
          setLoading(false);
          return;
        }
        setProject(p);
        const draft = isDraftJob(p);
        if (draft) {
          setTasks([]);
          setExpenses([]);
          setLoading(false);
          return;
        }
        setTasksError(null);
        setExpensesError(null);
        try {
          const tasksList = await listProjectTasks(id);
          if (cancelled) return;
          setTasks(tasksList);
        } catch (te) {
          if (cancelled) return;
          setTasksError(te instanceof FirestoreIndexError ? te.message : "Failed to load tasks");
          setTasks([]);
        }
        try {
          const expensesList = await listProjectExpenses(id);
          if (cancelled) return;
          setExpenses(expensesList);
        } catch (ee) {
          if (cancelled) return;
          setExpensesError(ee instanceof FirestoreIndexError ? ee.message : "Failed to load expenses");
          setExpenses([]);
        }
      } catch {
        if (!cancelled) {
          setAccessDenied(true);
          setProject(null);
          setTasks([]);
          setExpenses([]);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [id, user?.id]);

  const handleAddTask = async () => {
    if (!project || !newTaskTitle.trim() || addingTask) return;
    setAddingTask(true);
    try {
      const taskId = await createTask(project.id, newTaskTitle.trim());
      setTasks((prev) => [
        ...prev,
        {
          id: taskId,
          projectId: project.id,
          title: newTaskTitle.trim(),
          status: "OPEN",
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
      ]);
      setNewTaskTitle("");
    } catch {
      // ignore
    } finally {
      setAddingTask(false);
    }
  };

  const handleToggleTask = async (task: TaskDoc) => {
    if (!project || togglingTaskId) return;
    setTogglingTaskId(task.id);
    try {
      const nextStatus = task.status === "DONE" ? "OPEN" : "DONE";
      await updateTaskStatus(project.id, task.id, nextStatus);
      setTasks((prev) =>
        prev.map((t) =>
          t.id === task.id ? { ...t, status: nextStatus } : t
        )
      );
    } catch {
      // ignore
    } finally {
      setTogglingTaskId(null);
    }
  };

  const totalExpenses = expenses.reduce((sum, e) => sum + (e.amount ?? 0), 0);
  const currency = expenses[0]?.currency ?? "EUR";

  const canEditExpenses = !!project && !!user?.id && (
    project.ownerId === user.id || (project.orgId && project.orgId.length > 0)
  );

  const openAddExpense = () => {
    setEditingExpense(null);
    setExpenseForm({
      title: "",
      amount: "",
      currency: "EUR",
      date: new Date().toISOString().slice(0, 10),
      category: "OTHER",
      note: "",
    });
    setExpenseModalOpen(true);
  };

  const openEditExpense = (exp: ExpenseDoc) => {
    setEditingExpense(exp);
    setExpenseForm({
      title: exp.title,
      amount: String(exp.amount ?? ""),
      currency: exp.currency,
      date: exp.date ? exp.date.slice(0, 10) : new Date().toISOString().slice(0, 10),
      category: (exp.category as ExpenseCategory) ?? "OTHER",
      note: exp.note ?? "",
    });
    setExpenseModalOpen(true);
  };

  const handleSaveExpense = async () => {
    if (!project || !user?.id) return;
    const amount = parseFloat(expenseForm.amount);
    if (!expenseForm.title.trim() || isNaN(amount) || amount < 0) return;
    setSavingExpense(true);
    try {
      if (editingExpense) {
        await updateExpense(project.id, editingExpense.id, {
          title: expenseForm.title.trim(),
          amount,
          currency: expenseForm.currency,
          date: expenseForm.date,
          category: expenseForm.category,
          note: expenseForm.note.trim() || undefined,
        });
        setExpenses((prev) =>
          prev.map((e) =>
            e.id === editingExpense.id
              ? {
                  ...e,
                  title: expenseForm.title.trim(),
                  amount,
                  currency: expenseForm.currency,
                  date: expenseForm.date,
                  category: expenseForm.category,
                  note: expenseForm.note.trim() || undefined,
                }
              : e
          )
        );
      } else {
        const expenseId = await createExpense(project.id, user.id, {
          title: expenseForm.title.trim(),
          amount,
          currency: expenseForm.currency,
          date: expenseForm.date,
          category: expenseForm.category,
          note: expenseForm.note.trim() || undefined,
        });
        setExpenses((prev) => [
          {
            id: expenseId,
            projectId: project.id,
            title: expenseForm.title.trim(),
            amount,
            currency: expenseForm.currency,
            date: expenseForm.date,
            category: expenseForm.category,
            note: expenseForm.note.trim() || undefined,
          },
          ...prev,
        ]);
      }
      setExpenseModalOpen(false);
    } finally {
      setSavingExpense(false);
    }
  };

  const handleDeleteExpense = async (exp: ExpenseDoc) => {
    if (!project || !confirm(t("projects.expenseConfirmDelete"))) return;
    setDeletingExpenseId(exp.id);
    try {
      await deleteExpense(project.id, exp.id);
      setExpenses((prev) => prev.filter((e) => e.id !== exp.id));
    } finally {
      setDeletingExpenseId(null);
    }
  };

  if (loading) {
    return (
      <div className="space-y-6">
        <Link
          href="/app/projects"
          className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="size-4" />
          {t("projects.titleJobs")}
        </Link>
        <ProjectDetailSkeleton />
      </div>
    );
  }

  if (accessDenied || !project) {
    return (
      <div className="space-y-6">
        <Link
          href="/app/projects"
          className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="size-4" />
          {t("projects.titleJobs")}
        </Link>
        <Card className="border-destructive/50">
          <CardContent className="py-8">
            <p className="text-center text-destructive font-medium">
              {t("projects.accessDenied")}
            </p>
            <p className="mt-2 text-center text-sm text-muted-foreground">
              {t("projects.accessDeniedHint")}
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const showDraft = isDraftJob(project);

  const tabs: { id: TabId; label: string }[] = [
    { id: "overview", label: t("projects.tabOverview") },
    { id: "tasks", label: t("projects.tabTasks") },
    { id: "expenses", label: t("projects.tabExpenses") },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <Link
            href="/app/projects"
            className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground mb-2"
          >
            <ArrowLeft className="size-4" />
            {t("projects.titleJobs")}
          </Link>
          <p className="text-xs text-muted-foreground uppercase tracking-wide">
            {t("projects.jobDetailLabel")}
          </p>
          <h1 className="text-xl font-semibold">{project.name || t("projects.noName")}</h1>
          <ProjectOwnershipMeta project={project} className="mt-2" />
          {(project.addressText || project.city) && (
            <p className="text-sm text-muted-foreground mt-1">
              {[project.addressText, project.city].filter(Boolean).join(", ")}
            </p>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2 justify-end">
          <ProjectOwnershipBadge project={project} />
          <WorkTypeBadge project={project} />
          <JobLifecycleBadge project={project} />
        </div>
      </div>

      {showDraft && user?.id ? (
        <DraftJobWorkspace
          project={project}
          userId={user.id}
          onProjectUpdated={setProject}
        />
      ) : (
        <>
      <WorkTypeBadge project={project} />

      <div className="flex gap-2 border-b">
        {tabs.map((tab) => (
          <Button
            key={tab.id}
            variant={activeTab === tab.id ? "secondary" : "ghost"}
            size="sm"
            onClick={() => setActiveTab(tab.id)}
            className={
              activeTab === tab.id
                ? "border-b-2 border-[#1D376A] rounded-b-none"
                : ""
            }
          >
            {tab.label}
          </Button>
        ))}
      </div>

      {activeTab === "overview" && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">{t("projects.tabOverview")}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <ProjectOwnershipMeta project={project} variant="panel" />
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <p className="text-sm text-muted-foreground">{t("projects.tabTasks")}</p>
                <p className="text-lg font-medium">{tasks.length}</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">{t("projects.tabExpenses")}</p>
                <p className="text-lg font-medium">
                  {totalExpenses.toFixed(2)} {currency}
                </p>
              </div>
            </div>
            <p className="mt-4 text-sm text-muted-foreground">
              {t("help.faq2a")}
            </p>
          </CardContent>
        </Card>
      )}

      {activeTab === "tasks" && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">{t("projects.tabTasks")}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex gap-2">
              <Input
                placeholder={t("projects.newTaskPlaceholder")}
                value={newTaskTitle}
                onChange={(e) => setNewTaskTitle(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), handleAddTask())}
              />
              <Button
                size="sm"
                onClick={handleAddTask}
                disabled={addingTask || !newTaskTitle.trim()}
              >
                <Plus className="size-4 mr-2" />
                {t("projects.addTask")}
              </Button>
            </div>
            {tasksError && (
              <p className="text-sm text-destructive">{tasksError}</p>
            )}
            {tasks.length === 0 && !tasksError ? (
              <div className="py-12 text-center text-muted-foreground">
                {t("projects.tasksEmpty")}
              </div>
            ) : tasks.length > 0 ? (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t("projects.tasksToggle")}</TableHead>
                    <TableHead>{t("estimates.titleCol")}</TableHead>
                    <TableHead>{t("estimates.statusCol")}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {tasks.map((task) => (
                    <TableRow key={task.id}>
                      <TableCell className="w-12">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleToggleTask(task)}
                          disabled={togglingTaskId === task.id}
                          title={task.status === "DONE" ? "Mark open" : "Mark done"}
                          className="p-0 h-8 w-8"
                        >
                          {togglingTaskId === task.id ? (
                            <Loader2 className="size-4 animate-spin" />
                          ) : task.status === "DONE" ? (
                            <CheckCircle2 className="size-4 text-[#e06737]" />
                          ) : (
                            <Circle className="size-4 text-muted-foreground" />
                          )}
                        </Button>
                      </TableCell>
                      <TableCell>
                        <span
                          className={
                            task.status === "DONE"
                              ? "line-through text-muted-foreground"
                              : ""
                          }
                        >
                          {task.title || t("projects.noName")}
                        </span>
                      </TableCell>
                      <TableCell>
                        <Badge variant={task.status === "DONE" ? "secondary" : "default"}>
                          {task.status}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            ) : null}
          </CardContent>
        </Card>
      )}

      {activeTab === "expenses" && (
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-base">{t("projects.tabExpenses")}</CardTitle>
            {canEditExpenses && (
              <Button size="sm" onClick={openAddExpense}>
                <Plus className="size-4 mr-2" />
                {t("projects.addExpense")}
              </Button>
            )}
          </CardHeader>
          <CardContent className="p-0">
            {expensesError && (
              <div className="px-4 py-2">
                <p className="text-sm text-destructive">{expensesError}</p>
              </div>
            )}
            {expenses.length === 0 && !expensesError ? (
              <div className="py-12 text-center">
                <p className="text-muted-foreground">{t("projects.expensesEmpty")}</p>
                {canEditExpenses && (
                  <Button variant="outline" size="sm" className="mt-4" onClick={openAddExpense}>
                    <Plus className="size-4 mr-2" />
                    {t("projects.addExpense")}
                  </Button>
                )}
              </div>
            ) : expenses.length > 0 ? (
              <>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>{t("estimates.titleCol")}</TableHead>
                      <TableHead>{t("estimates.totalCol")}</TableHead>
                      <TableHead className="hidden sm:table-cell">{t("projects.expenseDate")}</TableHead>
                      {canEditExpenses && <TableHead className="w-[80px]"></TableHead>}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {expenses.map((exp) => (
                      <TableRow key={exp.id}>
                        <TableCell>{exp.title || t("projects.noName")}</TableCell>
                        <TableCell>
                          {(exp.amount ?? 0).toFixed(2)} {exp.currency}
                        </TableCell>
                        <TableCell className="hidden sm:table-cell text-muted-foreground">
                          {exp.date ? new Date(exp.date).toLocaleDateString() : "-"}
                        </TableCell>
                        {canEditExpenses && (
                          <TableCell>
                            <div className="flex gap-1">
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => openEditExpense(exp)}
                                title={t("common.edit")}
                                className="p-0 h-8 w-8"
                              >
                                <Pencil className="size-4" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => handleDeleteExpense(exp)}
                                disabled={deletingExpenseId === exp.id}
                                title={t("common.delete")}
                                className="p-0 h-8 w-8"
                              >
                                {deletingExpenseId === exp.id ? (
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
                  {t("projects.expensesTotal")}: {totalExpenses.toFixed(2)} {currency}
                </div>
              </>
            ) : null}
          </CardContent>
        </Card>
      )}

      <Dialog open={expenseModalOpen} onOpenChange={setExpenseModalOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              {editingExpense ? t("projects.editExpense") : t("projects.addExpense")}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div>
              <Label htmlFor="exp-title">{t("estimates.titleCol")} *</Label>
              <Input
                id="exp-title"
                value={expenseForm.title}
                onChange={(e) => setExpenseForm((f) => ({ ...f, title: e.target.value }))}
                placeholder={t("projects.expenseTitlePlaceholder")}
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="exp-amount">{t("estimates.totalCol")} *</Label>
                <Input
                  id="exp-amount"
                  type="number"
                  min="0"
                  step="0.01"
                  value={expenseForm.amount}
                  onChange={(e) => setExpenseForm((f) => ({ ...f, amount: e.target.value }))}
                />
              </div>
              <div>
                <Label htmlFor="exp-currency">{t("projects.expenseCurrency")}</Label>
                <Select
                  value={expenseForm.currency}
                  onValueChange={(v) => setExpenseForm((f) => ({ ...f, currency: v ?? "EUR" }))}
                >
                  <SelectTrigger id="exp-currency">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="EUR">EUR</SelectItem>
                    <SelectItem value="CZK">CZK</SelectItem>
                    <SelectItem value="USD">USD</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="exp-date">{t("projects.expenseDate")}</Label>
                <Input
                  id="exp-date"
                  type="date"
                  value={expenseForm.date}
                  onChange={(e) => setExpenseForm((f) => ({ ...f, date: e.target.value }))}
                />
              </div>
              <div>
                <Label htmlFor="exp-category">{t("projects.expenseCategory")}</Label>
                <Select
                  value={expenseForm.category}
                  onValueChange={(v) => setExpenseForm((f) => ({ ...f, category: v as ExpenseCategory }))}
                >
                  <SelectTrigger id="exp-category">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {EXPENSE_CATEGORIES.map((c) => (
                      <SelectItem key={c} value={c}>
                        {t(`projects.expenseCategory.${c}`)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div>
              <Label htmlFor="exp-note">{t("projects.expenseNote")}</Label>
              <Input
                id="exp-note"
                value={expenseForm.note}
                onChange={(e) => setExpenseForm((f) => ({ ...f, note: e.target.value }))}
                placeholder={t("projects.expenseNotePlaceholder")}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setExpenseModalOpen(false)}>
              {t("common.cancel")}
            </Button>
            <Button
              onClick={handleSaveExpense}
              disabled={
                savingExpense ||
                !expenseForm.title.trim() ||
                isNaN(parseFloat(expenseForm.amount)) ||
                parseFloat(expenseForm.amount) < 0
              }
            >
              {savingExpense ? t("common.loading") : t("common.save")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
        </>
      )}
    </div>
  );
}
