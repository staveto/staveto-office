"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Plus, Trash2, Loader2 } from "lucide-react";
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
import { createStandaloneQuote } from "@/services/quotes";
import type { QuoteStatus } from "@/lib/quotes";
import { QUOTE_DRAFT_UNITS } from "@/lib/quoteDraftItems";

const STATUSES: QuoteStatus[] = ["draft", "sent", "accepted", "rejected"];
const DEFAULT_UNIT = "ks";

interface LineItem {
  name: string;
  qty: number;
  unit: string;
  unitPrice: number;
}

export default function NewQuotePage() {
  const router = useRouter();
  const { t } = useI18n();
  const { user } = useAuth();
  const { activeWorkspace } = useWorkspace();
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [title, setTitle] = useState("");
  const [clientName, setClientName] = useState("");
  const [clientEmail, setClientEmail] = useState("");
  const [status, setStatus] = useState<QuoteStatus>("draft");
  const [vatPercent, setVatPercent] = useState(20);
  const [notes, setNotes] = useState("");
  const [items, setItems] = useState<LineItem[]>([
    { name: "", qty: 1, unit: DEFAULT_UNIT, unitPrice: 0 },
  ]);

  const itemsWithTotals = items.map((item) => ({
    ...item,
    total: computeItemTotal(item.qty, item.unitPrice),
  }));
  const { grandTotal } = computeEstimateTotals(
    itemsWithTotals,
    vatPercent
  );

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

  async function handleSubmit(e: React.FormEvent) {
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
      const quoteId = await createStandaloneQuote(activeWorkspace, user.id, {
        title: title.trim(),
        clientName: clientName.trim(),
        clientEmail: clientEmail.trim() || undefined,
        status,
        items: validItems.map(({ name, qty, unit, unitPrice }) => ({
          name: name.trim(),
          qty,
          unit,
          unitPrice,
        })),
        vatPercent,
        notes: notes.trim() || undefined,
      });
      router.push(`/app/quotes/${quoteId}`);
    } catch (error) {
      setErrors({
        submit: error instanceof Error ? error.message : t("quotes.saveError"),
      });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Link href="/app/quotes" className={buttonVariants({ variant: "ghost", size: "icon" })}>
          <ArrowLeft className="size-4" />
        </Link>
        <div>
          <h1 className="text-2xl font-semibold">{t("quotes.new")}</h1>
          <p className="text-muted-foreground mt-1">{t("quotes.newSubtitle")}</p>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        {errors.submit && (
          <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-4 text-destructive text-sm">
            {errors.submit}
          </div>
        )}

        <Card>
          <CardHeader>
            <CardTitle>{t("quotes.sectionDetails")}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="title">{t("quotes.fieldTitle")}</Label>
                <Input
                  id="title"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  aria-invalid={!!errors.title}
                />
                {errors.title && <p className="text-sm text-destructive">{errors.title}</p>}
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
                <Input
                  id="client"
                  value={clientName}
                  onChange={(e) => setClientName(e.target.value)}
                  aria-invalid={!!errors.clientName}
                />
                {errors.clientName && (
                  <p className="text-sm text-destructive">{errors.clientName}</p>
                )}
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
            {errors.items && <p className="text-sm text-destructive mb-3">{errors.items}</p>}
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
                        min={0}
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
                        min={0}
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
            <div className="mt-4 flex justify-end gap-6 text-sm">
              <span>
                {t("projects.draft.quoteItem.grandTotal")}:{" "}
                <strong>{formatMoney(grandTotal)}</strong>
              </span>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6 space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <Label htmlFor="vat">{t("projects.draft.quoteItem.vat")}</Label>
                <Input
                  id="vat"
                  type="number"
                  min={0}
                  max={100}
                  value={vatPercent}
                  onChange={(e) => setVatPercent(parseFloat(e.target.value) || 0)}
                  className="mt-1 max-w-[120px]"
                />
              </div>
              <div className="sm:col-span-2">
                <Label htmlFor="notes">{t("projects.draft.quoteItem.notes")}</Label>
                <Textarea
                  id="notes"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  rows={2}
                  className="mt-1"
                />
              </div>
            </div>
            <p className="text-xs text-muted-foreground">
              {t("projects.draft.quoteItem.disclaimer")}
            </p>
            <div className="flex gap-2">
              <Button type="submit" disabled={saving} className="bg-[#e06737] hover:bg-[#c95a30] text-white">
                {saving ? (
                  <>
                    <Loader2 className="size-4 mr-2 animate-spin" />
                    {t("common.loading")}
                  </>
                ) : (
                  t("common.save")
                )}
              </Button>
              <Link href="/app/quotes" className={buttonVariants({ variant: "outline" })}>
                {t("common.cancel")}
              </Link>
            </div>
          </CardContent>
        </Card>
      </form>
    </div>
  );
}
