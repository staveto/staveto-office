"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Plus, Trash2, Loader2, Save } from "lucide-react";
import { useI18n } from "@/i18n/I18nContext";
import { useAuth } from "@/context/AuthContext";
import { useWorkspace } from "@/context/WorkspaceContext";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { formatMoney } from "@/lib/format";
import { computeItemTotal, computeEstimateTotals } from "@/lib/estimateUtils";
import { hasQuoteAccess, saveQuote, setQuoteStatus, removeQuote } from "@/services/quotes";
import type { QuoteStatus } from "@/lib/quotes";
import { QuoteStatusBadge } from "@/components/quotes/QuoteStatusBadge";
import { QUOTE_DRAFT_UNITS } from "@/lib/quoteDraftItems";
import { useQuoteDetailAgentScreenSync } from "@/hooks/useManagerAgentScreenSync";

const STATUSES: QuoteStatus[] = ["draft", "sent", "accepted", "rejected"];
const DEFAULT_UNIT = "ks";

interface LineItem {
  category?: "material" | "work";
  name: string;
  qty: number;
  unit: string;
  unitPrice: number;
}

export default function QuoteDetailPage() {
  const params = useParams();
  const router = useRouter();
  const { t } = useI18n();
  const { user } = useAuth();
  const { activeWorkspace } = useWorkspace();
  const id = params.id as string;

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [statusBusy, setStatusBusy] = useState(false);
  const [notFound, setNotFound] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [projectId, setProjectId] = useState<string | undefined>();
  const [title, setTitle] = useState("");
  const [clientName, setClientName] = useState("");
  const [clientEmail, setClientEmail] = useState("");
  const [status, setStatus] = useState<QuoteStatus>("draft");
  const [vatPercent, setVatPercent] = useState(20);
  const [notes, setNotes] = useState("");
  const [currency, setCurrency] = useState<string | null>(null);
  const [items, setItems] = useState<LineItem[]>([]);

  const itemsWithTotals = items.map((item) => ({
    ...item,
    total: computeItemTotal(item.qty, item.unitPrice),
  }));
  const { subtotal, vatAmount, grandTotal } = computeEstimateTotals(
    itemsWithTotals,
    vatPercent
  );

  useEffect(() => {
    if (!user?.id || !activeWorkspace) return;
    (async () => {
      try {
        const access = await hasQuoteAccess(id, user.id, activeWorkspace);
        if (!access.allowed || !access.quote) {
          setNotFound(true);
          return;
        }
        const q = access.quote;
        setProjectId(q.projectId);
        setTitle(q.title);
        setClientName(q.clientName);
        setClientEmail(q.clientEmail ?? "");
        setStatus(q.status);
        setCurrency(q.currency ?? null);
        setVatPercent(q.vatPercent);
        setNotes(q.notes ?? "");
        setItems(
          q.items.map((i) => ({
            category: i.category,
            name: i.name,
            qty: i.qty,
            unit: i.unit,
            unitPrice: i.unitPrice,
          }))
        );
      } catch {
        setNotFound(true);
      } finally {
        setLoading(false);
      }
    })();
  }, [id, user?.id, activeWorkspace?.id]);

  useQuoteDetailAgentScreenSync({
    quoteId: id,
    title,
    status,
    clientEmail,
    currency,
    projectId,
    unsavedChanges: saving,
  });

  function addItem() {
    setItems([...items, { name: "", qty: 1, unit: DEFAULT_UNIT, unitPrice: 0 }]);
  }

  function removeItem(index: number) {
    if (items.length <= 1) return;
    setItems(items.filter((_, i) => i !== index));
  }

  function updateItem(index: number, field: keyof LineItem, value: string | number) {
    const next = [...items];
    next[index] = { ...next[index], [field]: value };
    setItems(next);
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!user?.id || !activeWorkspace) return;

    const err: Record<string, string> = {};
    if (!title.trim()) err.title = t("quotes.validation.title");
    if (!clientName.trim()) err.clientName = t("quotes.validation.client");
    const validItems = items.filter((i) => i.name.trim());
    if (validItems.length === 0) err.items = t("quotes.validation.items");

    setErrors(err);
    if (Object.keys(err).length > 0) return;

    setSaving(true);
    try {
      await saveQuote(id, user.id, {
        title: title.trim(),
        clientName: clientName.trim(),
        clientEmail: clientEmail.trim() || undefined,
        status,
        vatPercent,
        notes: notes.trim() || undefined,
        items: validItems.map(({ category, name, qty, unit, unitPrice }) => ({
          category,
          name: name.trim(),
          qty,
          unit,
          unitPrice,
        })),
      }, activeWorkspace);
      setErrors({});
    } catch (error) {
      setErrors({
        submit: error instanceof Error ? error.message : t("quotes.saveError"),
      });
    } finally {
      setSaving(false);
    }
  }

  async function handleQuickStatus(next: QuoteStatus) {
    if (!user?.id || !activeWorkspace) return;
    setStatusBusy(true);
    try {
      const updated = await setQuoteStatus(id, user.id, next, activeWorkspace);
      setStatus(updated.status);
    } catch (error) {
      setErrors({
        submit: error instanceof Error ? error.message : t("quotes.saveError"),
      });
    } finally {
      setStatusBusy(false);
    }
  }

  async function handleDelete() {
    if (!user?.id || !activeWorkspace) return;
    setSaving(true);
    try {
      await removeQuote(id, user.id, activeWorkspace);
      router.push("/app/quotes");
    } catch {
      setErrors({ delete: t("quotes.deleteError") });
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="size-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (notFound) {
    return (
      <div className="space-y-4 text-center py-12">
        <p className="text-destructive font-medium">{t("quotes.notFound")}</p>
        <Link href="/app/quotes" className={buttonVariants()}>
          {t("quotes.backToList")}
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex items-start gap-4">
          <Link href="/app/quotes" className={buttonVariants({ variant: "ghost", size: "icon" })}>
            <ArrowLeft className="size-4" />
          </Link>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-2xl font-semibold">{title || t("quotes.detailTitle")}</h1>
              <QuoteStatusBadge status={status} />
            </div>
            <p className="text-muted-foreground mt-1">
              {clientName} · {formatMoney(grandTotal)}
            </p>
            {projectId && (
              <p className="text-sm mt-2">
                <Link
                  href={`/app/projects/${projectId}`}
                  className="text-[#1D376A] hover:underline"
                >
                  {t("quotes.linkedProject")}
                </Link>
              </p>
            )}
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link
            href={`/app/quotes/${id}/print`}
            className={buttonVariants({ variant: "outline", size: "sm" })}
          >
            {t("projects.draft.exportPdf")}
          </Link>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={statusBusy || status === "sent"}
            onClick={() => handleQuickStatus("sent")}
          >
            {t("quotes.markSent")}
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={statusBusy || status === "accepted"}
            onClick={() => handleQuickStatus("accepted")}
          >
            {t("quotes.markAccepted")}
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={statusBusy || status === "rejected"}
            onClick={() => handleQuickStatus("rejected")}
          >
            {t("quotes.markRejected")}
          </Button>
        </div>
      </div>

      <p className="text-sm text-muted-foreground">{t("projects.draft.quoteItem.disclaimer")}</p>

      <form onSubmit={handleSave} className="space-y-6">
        {errors.submit && (
          <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-4 text-destructive text-sm">
            {errors.submit}
          </div>
        )}

        <Card>
          <CardHeader>
            <CardTitle>{t("quotes.sectionDetails")}</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="title">{t("quotes.fieldTitle")}</Label>
              <Input id="title" value={title} onChange={(e) => setTitle(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="status">{t("quotes.colStatus")}</Label>
              <Select value={status} onValueChange={(v) => setStatus(v as QuoteStatus)}>
                <SelectTrigger id="status">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {STATUSES.map((s) => (
                    <SelectItem key={s} value={s}>
                      {t(`quotes.status.${s}`)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="client">{t("quotes.colClient")}</Label>
              <Input id="client" value={clientName} onChange={(e) => setClientName(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="email">{t("projects.draft.customerEmail")}</Label>
              <Input
                id="email"
                type="email"
                value={clientEmail}
                onChange={(e) => setClientEmail(e.target.value)}
              />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <CardTitle>{t("quotes.sectionLines")}</CardTitle>
              <CardDescription>{t("quotes.sectionLinesHint")}</CardDescription>
            </div>
            <Button type="button" variant="outline" size="sm" onClick={addItem}>
              <Plus className="size-4 mr-1" />
              {t("projects.draft.quoteItem.add")}
            </Button>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("projects.draft.quoteItem.name")}</TableHead>
                  <TableHead>{t("projects.draft.quoteItem.qty")}</TableHead>
                  <TableHead>{t("projects.draft.quoteItem.unit")}</TableHead>
                  <TableHead>{t("projects.draft.quoteItem.unitPrice")}</TableHead>
                  <TableHead className="text-right">{t("projects.draft.quoteItem.total")}</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((item, index) => (
                  <TableRow key={index}>
                    <TableCell>
                      <Input
                        value={item.name}
                        onChange={(e) => updateItem(index, "name", e.target.value)}
                      />
                    </TableCell>
                    <TableCell>
                      <Input
                        type="number"
                        value={item.qty}
                        onChange={(e) =>
                          updateItem(index, "qty", parseFloat(e.target.value) || 0)
                        }
                      />
                    </TableCell>
                    <TableCell>
                      <Select
                        value={item.unit}
                        onValueChange={(v) => updateItem(index, "unit", v ?? DEFAULT_UNIT)}
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {QUOTE_DRAFT_UNITS.map((u) => (
                            <SelectItem key={u} value={u}>
                              {u}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </TableCell>
                    <TableCell>
                      <Input
                        type="number"
                        value={item.unitPrice}
                        onChange={(e) =>
                          updateItem(index, "unitPrice", parseFloat(e.target.value) || 0)
                        }
                      />
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatMoney(computeItemTotal(item.qty, item.unitPrice))}
                    </TableCell>
                    <TableCell>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        onClick={() => removeItem(index)}
                        disabled={items.length <= 1}
                      >
                        <Trash2 className="size-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            <div className="mt-4 rounded-lg bg-muted/50 p-4 space-y-1 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">{t("projects.draft.quoteItem.subtotal")}</span>
                <span className="tabular-nums">{formatMoney(subtotal)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">
                  {t("projects.draft.quoteItem.vatLine", { percent: vatPercent })}
                </span>
                <span className="tabular-nums">{formatMoney(vatAmount)}</span>
              </div>
              <div className="flex justify-between font-medium pt-1 border-t">
                <span>{t("projects.draft.quoteItem.grandTotal")}</span>
                <span className="tabular-nums">{formatMoney(grandTotal)}</span>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6 space-y-4">
            <div>
              <Label htmlFor="notes">{t("projects.draft.quoteItem.notes")}</Label>
              <Textarea
                id="notes"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={2}
                className="mt-1"
              />
            </div>
            <div className="flex flex-wrap gap-2">
              <Button
                type="submit"
                disabled={saving}
                className="bg-[#e06737] hover:bg-[#c95a30] text-white"
              >
                {saving ? (
                  <Loader2 className="size-4 mr-2 animate-spin" />
                ) : (
                  <Save className="size-4 mr-2" />
                )}
                {t("common.save")}
              </Button>
              <Button type="button" variant="destructive" disabled={saving} onClick={handleDelete}>
                {t("common.delete")}
              </Button>
            </div>
            {errors.delete && <p className="text-sm text-destructive">{errors.delete}</p>}
          </CardContent>
        </Card>
      </form>
    </div>
  );
}
