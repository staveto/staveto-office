"use client";

import { useState, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Plus, Trash2, Loader2 } from "lucide-react";
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
import type { EstimateStatus } from "@/lib/types";
import { getProject, listProjectQuoteDraftItems } from "@/lib/projects";

const STATUSES: EstimateStatus[] = ["draft", "sent", "approved", "rejected"];
const DEFAULT_UNIT = "ks";

interface LineItem {
  name: string;
  qty: number;
  unit: string;
  unitPrice: number;
}

export default function NewEstimatePage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const projectId = searchParams.get("projectId");
  const [prefillLoading, setPrefillLoading] = useState(!!projectId);
  const [prefillSource, setPrefillSource] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [title, setTitle] = useState("");
  const [clientName, setClientName] = useState("");
  const [clientEmail, setClientEmail] = useState("");
  const [status, setStatus] = useState<EstimateStatus>("draft");
  const [vatPercent, setVatPercent] = useState(20);
  const [notes, setNotes] = useState("");
  const [items, setItems] = useState<LineItem[]>([
    { name: "", qty: 1, unit: DEFAULT_UNIT, unitPrice: 0 },
  ]);

  useEffect(() => {
    if (!projectId) {
      setPrefillLoading(false);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const [project, quoteItems] = await Promise.all([
          getProject(projectId),
          listProjectQuoteDraftItems(projectId),
        ]);
        if (cancelled || !project) return;
        setTitle(project.name || "");
        setClientName(project.customerName || "");
        setClientEmail(project.customerEmail || "");
        if (project.quoteDraftVatPercent != null) {
          setVatPercent(project.quoteDraftVatPercent);
        }
        if (project.quoteDraftNotes) setNotes(project.quoteDraftNotes);
        if (quoteItems.length > 0) {
          setItems(
            quoteItems.map((row) => ({
              name: row.name,
              qty: row.qty,
              unit: row.unit,
              unitPrice: row.unitPrice,
            }))
          );
        }
        setPrefillSource(project.name || projectId);
      } catch {
        /* keep empty form */
      } finally {
        if (!cancelled) setPrefillLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [projectId]);

  const itemsWithTotals = items.map((item) => ({
    ...item,
    total: computeItemTotal(item.qty, item.unitPrice),
  }));
  const { subtotal, vatAmount, grandTotal } = computeEstimateTotals(
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
    const err: Record<string, string> = {};

    if (!title.trim()) err.title = "Title is required";
    if (!clientName.trim()) err.clientName = "Client name is required";

    const validItems = items.filter((i) => i.name.trim());
    if (validItems.length === 0) err.items = "Add at least one line item";
    validItems.forEach((item, i) => {
      if (item.qty <= 0) err[`item_${i}_qty`] = "Quantity must be positive";
      if (item.unitPrice < 0) err[`item_${i}_price`] = "Price cannot be negative";
    });

    setErrors(err);
    if (Object.keys(err).length > 0) return;

    setSaving(true);
    try {
      const res = await fetch("/api/estimates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
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
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to create");
      }

      const estimate = await res.json();
      router.push(`/estimates/${estimate.id}`);
    } catch (error) {
      setErrors({
        submit: error instanceof Error ? error.message : "Failed to save",
      });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Link
          href="/estimates"
          className={buttonVariants({ variant: "ghost", size: "icon" })}
        >
          <ArrowLeft className="size-4" />
        </Link>
        <div>
          <h1 className="text-2xl font-semibold">New Estimate</h1>
          <p className="text-muted-foreground mt-1">Create a new quote or estimate.</p>
        </div>
      </div>

      {prefillSource && (
        <div className="rounded-lg border bg-muted/40 px-4 py-3 text-sm">
          Loaded from draft job: <strong>{prefillSource}</strong>
          {projectId && (
            <>
              {" "}
              ·{" "}
              <Link href={`/app/projects/${projectId}`} className="text-[#1D376A] hover:underline">
                Back to draft
              </Link>
            </>
          )}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-6">
        {prefillLoading && (
          <p className="text-sm text-muted-foreground flex items-center gap-2">
            <Loader2 className="size-4 animate-spin" />
            Loading draft quote lines…
          </p>
        )}
        {errors.submit && (
          <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-4 text-destructive">
            {errors.submit}
          </div>
        )}

        <Card>
          <CardHeader>
            <CardTitle>Details</CardTitle>
            <CardDescription>Basic information about the estimate.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="title">Title</Label>
                <Input
                  id="title"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="e.g. Renovation Quote"
                  aria-invalid={!!errors.title}
                />
                {errors.title && (
                  <p className="text-sm text-destructive">{errors.title}</p>
                )}
              </div>
              <div className="space-y-2">
                <Label htmlFor="status">Status</Label>
                <Select
                  value={status}
                  onValueChange={(v) => setStatus(v as EstimateStatus)}
                >
                  <SelectTrigger id="status" className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {STATUSES.map((s) => (
                      <SelectItem key={s} value={s}>
                        {s}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="clientName">Client Name</Label>
                <Input
                  id="clientName"
                  value={clientName}
                  onChange={(e) => setClientName(e.target.value)}
                  placeholder="Client or company name"
                  aria-invalid={!!errors.clientName}
                />
                {errors.clientName && (
                  <p className="text-sm text-destructive">{errors.clientName}</p>
                )}
              </div>
              <div className="space-y-2">
                <Label htmlFor="clientEmail">Client Email</Label>
                <Input
                  id="clientEmail"
                  type="email"
                  value={clientEmail}
                  onChange={(e) => setClientEmail(e.target.value)}
                  placeholder="client@example.com"
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="notes">Notes</Label>
              <Textarea
                id="notes"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Optional notes..."
                rows={3}
              />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle>Line Items</CardTitle>
                <CardDescription>Add items with quantity, unit, and price.</CardDescription>
              </div>
              <Button type="button" variant="outline" size="sm" onClick={addItem}>
                <Plus className="size-4 mr-2" />
                Add Item
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            {errors.items && (
              <p className="text-sm text-destructive mb-4">{errors.items}</p>
            )}
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead className="w-24">Qty</TableHead>
                    <TableHead className="w-24">Unit</TableHead>
                    <TableHead className="w-32">Unit Price</TableHead>
                    <TableHead className="w-32">Total</TableHead>
                    <TableHead className="w-12"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {items.map((item, i) => (
                    <TableRow key={i}>
                      <TableCell>
                        <Input
                          value={item.name}
                          onChange={(e) => updateItem(i, "name", e.target.value)}
                          placeholder="Item name"
                          className="h-8"
                        />
                      </TableCell>
                      <TableCell>
                        <Input
                          type="number"
                          step="0.01"
                          min="0"
                          value={item.qty || ""}
                          onChange={(e) =>
                            updateItem(i, "qty", parseFloat(e.target.value) || 0)
                          }
                          className="h-8"
                        />
                      </TableCell>
                      <TableCell>
                        <Input
                          value={item.unit}
                          onChange={(e) => updateItem(i, "unit", e.target.value)}
                          className="h-8"
                        />
                      </TableCell>
                      <TableCell>
                        <Input
                          type="number"
                          step="0.01"
                          min="0"
                          value={item.unitPrice || ""}
                          onChange={(e) =>
                            updateItem(
                              i,
                              "unitPrice",
                              parseFloat(e.target.value) || 0
                            )
                          }
                          className="h-8"
                        />
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {formatMoney(itemsWithTotals[i].total)}
                      </TableCell>
                      <TableCell>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon-sm"
                          onClick={() => removeItem(i)}
                          disabled={items.length <= 1}
                        >
                          <Trash2 className="size-4 text-destructive" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
            <div className="mt-4 flex flex-col items-end gap-1 text-sm">
              <div className="flex gap-8">
                <span className="text-muted-foreground">Subtotal:</span>
                <span>{formatMoney(subtotal)}</span>
              </div>
              <div className="flex gap-8">
                <span className="text-muted-foreground">VAT ({vatPercent}%):</span>
                <span>{formatMoney(vatAmount)}</span>
              </div>
              <div className="flex gap-8 font-semibold text-base">
                <span>Total:</span>
                <span>{formatMoney(grandTotal)}</span>
              </div>
            </div>
            <div className="mt-4 flex gap-2 items-center">
              <Label htmlFor="vatPercent">VAT %</Label>
              <Input
                id="vatPercent"
                type="number"
                step="0.01"
                min="0"
                max="100"
                value={vatPercent}
                onChange={(e) =>
                  setVatPercent(parseFloat(e.target.value) || 0)
                }
                className="w-20 h-8"
              />
            </div>
          </CardContent>
        </Card>

        <div className="flex gap-2">
          <Button type="submit" disabled={saving}>
            {saving ? (
              <>
                <Loader2 className="size-4 mr-2 animate-spin" />
                Saving...
              </>
            ) : (
              "Create Estimate"
            )}
          </Button>
          <Link
            href="/estimates"
            className={buttonVariants({ variant: "outline" })}
          >
            Cancel
          </Link>
        </div>
      </form>
    </div>
  );
}
