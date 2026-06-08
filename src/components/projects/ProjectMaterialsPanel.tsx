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
import { Badge } from "@/components/ui/badge";
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
import { useI18n } from "@/i18n/I18nContext";
import type { ProjectDoc } from "@/lib/projects";
import {
  MATERIAL_CATEGORIES,
  MATERIAL_UNITS,
  calculateMaterialTotals,
  formatMaterialTotalsDisplay,
  resolveMaterialCurrency,
} from "@/lib/materialCatalog";
import {
  listMaterialSuggestions,
  listProjectMaterials,
  createProjectMaterial,
  updateProjectMaterial,
  deleteProjectMaterial,
  rejectMaterialSuggestion,
  type MaterialSuggestionDoc,
  type ProjectMaterialDoc,
} from "@/services/materials";
import type { MaterialCategory, MaterialUnit } from "@/services/materials/types";
import { Check, Loader2, Pencil, Plus, Trash2, X } from "lucide-react";

type UsedFormState = {
  id?: string;
  name: string;
  category: MaterialCategory;
  quantity: string;
  unit: MaterialUnit;
  unitPrice: string;
  totalPrice: string;
  currency: string;
  supplierName: string;
  notes: string;
  usedAt: string;
  sourceSuggestionId?: string;
};

const EMPTY_USED: UsedFormState = {
  name: "",
  category: "other_material",
  quantity: "",
  unit: "pcs",
  unitPrice: "",
  totalPrice: "",
  currency: "EUR",
  supplierName: "",
  notes: "",
  usedAt: new Date().toISOString().slice(0, 10),
};

function parseDecimal(value: string): number | undefined {
  const n = parseFloat(value.replace(",", "."));
  return Number.isFinite(n) ? n : undefined;
}

function recalcTotal(qty: string, unitPrice: string, prev: UsedFormState): UsedFormState {
  const q = parseDecimal(qty);
  const p = parseDecimal(unitPrice);
  if (q != null && p != null) {
    return { ...prev, quantity: qty, unitPrice, totalPrice: (q * p).toFixed(2) };
  }
  return { ...prev, quantity: qty, unitPrice };
}

type ProjectMaterialsPanelProps = {
  project: ProjectDoc;
  canEdit: boolean;
};

export function ProjectMaterialsPanel({ project, canEdit }: ProjectMaterialsPanelProps) {
  const { t } = useI18n();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [suggestions, setSuggestions] = useState<MaterialSuggestionDoc[]>([]);
  const [materials, setMaterials] = useState<ProjectMaterialDoc[]>([]);
  const [usedModalOpen, setUsedModalOpen] = useState(false);
  const [usedForm, setUsedForm] = useState<UsedFormState>(EMPTY_USED);
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [rejectingId, setRejectingId] = useState<string | null>(null);

  const plannedSuggestions = useMemo(
    () => suggestions.filter((s) => s.status === "planned"),
    [suggestions]
  );
  const totals = useMemo(() => calculateMaterialTotals(materials), [materials]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [sug, mat] = await Promise.all([
        listMaterialSuggestions(project.id),
        listProjectMaterials(project.id),
      ]);
      setSuggestions(sug);
      setMaterials(mat);
    } catch (e) {
      setError(e instanceof Error ? e.message : t("materials.loadError"));
    } finally {
      setLoading(false);
    }
  }, [project.id, t]);

  useEffect(() => {
    load();
  }, [load]);

  const unitLabel = (unit: MaterialUnit) => {
    const key = `materials.unit.${unit}`;
    const v = t(key);
    return v === key ? unit : v;
  };

  const categoryLabel = (category: MaterialCategory) => {
    const key = `materials.category.${category}`;
    const v = t(key);
    return v === key ? category : v;
  };

  const openAddUsed = () => {
    setUsedForm({ ...EMPTY_USED, usedAt: new Date().toISOString().slice(0, 10) });
    setUsedModalOpen(true);
  };

  const openEditUsed = (m: ProjectMaterialDoc) => {
    setUsedForm({
      id: m.id,
      name: m.name,
      category: m.category ?? "other_material",
      quantity: String(m.quantity),
      unit: m.unit,
      unitPrice: m.unitPrice != null ? String(m.unitPrice) : "",
      totalPrice: m.totalPrice != null ? String(m.totalPrice) : "",
      currency: m.currency || "EUR",
      supplierName: m.supplierName ?? "",
      notes: m.notes ?? "",
      usedAt: m.usedAt ? m.usedAt.slice(0, 10) : new Date().toISOString().slice(0, 10),
      sourceSuggestionId: m.sourceSuggestionId,
    });
    setUsedModalOpen(true);
  };

  const openAcceptSuggestion = (s: MaterialSuggestionDoc) => {
    setUsedForm({
      ...EMPTY_USED,
      name: s.name,
      category: s.category ?? "other_material",
      quantity: s.suggestedQuantity != null ? String(s.suggestedQuantity) : "",
      unit: s.unit ?? "pcs",
      unitPrice: s.estimatedUnitPrice != null ? String(s.estimatedUnitPrice) : "",
      totalPrice: s.estimatedTotalPrice != null ? String(s.estimatedTotalPrice) : "",
      currency: s.currency || "EUR",
      notes: s.description ?? s.sourceNote ?? "",
      usedAt: new Date().toISOString().slice(0, 10),
      sourceSuggestionId: s.id,
    });
    setUsedModalOpen(true);
  };

  const handleSaveUsed = async () => {
    const name = usedForm.name.trim();
    const quantity = parseDecimal(usedForm.quantity);
    if (!name || quantity == null || quantity <= 0) return;

    const unitPrice = usedForm.unitPrice.trim() ? parseDecimal(usedForm.unitPrice) : undefined;
    const totalPrice = usedForm.totalPrice.trim() ? parseDecimal(usedForm.totalPrice) : undefined;
    const usedAt = new Date(usedForm.usedAt);
    const orgId = project.orgId?.trim() || undefined;

    setSaving(true);
    try {
      if (usedForm.id) {
        await updateProjectMaterial(project.id, usedForm.id, {
          name,
          category: usedForm.category,
          quantity,
          unit: usedForm.unit,
          unitPrice,
          totalPrice,
          currency: resolveMaterialCurrency({ expenseCurrency: usedForm.currency }),
          supplierName: usedForm.supplierName.trim() || undefined,
          notes: usedForm.notes.trim() || undefined,
          usedAt,
        });
      } else {
        await createProjectMaterial(project.id, {
          name,
          category: usedForm.category,
          quantity,
          unit: usedForm.unit,
          unitPrice,
          totalPrice,
          currency: resolveMaterialCurrency({ expenseCurrency: usedForm.currency }),
          supplierName: usedForm.supplierName.trim() || undefined,
          notes: usedForm.notes.trim() || undefined,
          usedAt,
          organizationId: orgId,
          sourceSuggestionId: usedForm.sourceSuggestionId,
        });
      }
      setUsedModalOpen(false);
      await load();
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteUsed = async (m: ProjectMaterialDoc) => {
    if (!confirm(t("materials.confirmDelete"))) return;
    setDeletingId(m.id);
    try {
      await deleteProjectMaterial(project.id, m.id);
      await load();
    } finally {
      setDeletingId(null);
    }
  };

  const handleRejectSuggestion = async (s: MaterialSuggestionDoc) => {
    setRejectingId(s.id);
    try {
      await rejectMaterialSuggestion(project.id, s.id);
      await load();
    } finally {
      setRejectingId(null);
    }
  };

  if (loading) {
    return (
      <Card>
        <CardContent className="py-12 flex justify-center">
          <Loader2 className="size-6 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {error && (
        <p className="text-sm text-destructive">{error}</p>
      )}

      {/* Used materials */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle className="text-base">{t("materials.usedTitle")}</CardTitle>
            <p className="text-sm text-muted-foreground mt-1">{t("materials.usedHelper")}</p>
          </div>
          {canEdit && (
            <Button size="sm" onClick={openAddUsed}>
              <Plus className="size-4 mr-2" />
              {t("materials.addMaterial")}
            </Button>
          )}
        </CardHeader>
        <CardContent className="p-0">
          {materials.length === 0 ? (
            <div className="py-12 text-center text-muted-foreground">
              {t("materials.noMaterialsYet")}
              {canEdit && (
                <div className="mt-4">
                  <Button variant="outline" size="sm" onClick={openAddUsed}>
                    <Plus className="size-4 mr-2" />
                    {t("materials.addMaterial")}
                  </Button>
                </div>
              )}
            </div>
          ) : (
            <>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t("materials.materialName")}</TableHead>
                    <TableHead className="hidden md:table-cell">{t("materials.quantity")}</TableHead>
                    <TableHead>{t("materials.totalPrice")}</TableHead>
                    <TableHead className="hidden sm:table-cell">{t("materials.dateUsed")}</TableHead>
                    {canEdit && <TableHead className="w-[80px]" />}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {materials.map((m) => (
                    <TableRow key={m.id}>
                      <TableCell>
                        <div className="font-medium">{m.name}</div>
                        {m.category && (
                          <div className="text-xs text-muted-foreground">{categoryLabel(m.category)}</div>
                        )}
                        {m.supplierName && (
                          <div className="text-xs text-muted-foreground">{m.supplierName}</div>
                        )}
                      </TableCell>
                      <TableCell className="hidden md:table-cell text-muted-foreground">
                        {m.quantity} {unitLabel(m.unit)}
                      </TableCell>
                      <TableCell>
                        {(m.totalPrice ?? 0).toFixed(2)} {m.currency}
                      </TableCell>
                      <TableCell className="hidden sm:table-cell text-muted-foreground">
                        {m.usedAt ? new Date(m.usedAt).toLocaleDateString() : "-"}
                      </TableCell>
                      {canEdit && (
                        <TableCell>
                          <div className="flex gap-1">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => openEditUsed(m)}
                              title={t("common.edit")}
                              className="p-0 h-8 w-8"
                            >
                              <Pencil className="size-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleDeleteUsed(m)}
                              disabled={deletingId === m.id}
                              title={t("common.delete")}
                              className="p-0 h-8 w-8"
                            >
                              {deletingId === m.id ? (
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
                {t("materials.materialTotal")}: {formatMaterialTotalsDisplay(totals)}
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {/* Suggestions */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t("materials.recommendedTitle")}</CardTitle>
          <p className="text-sm text-muted-foreground mt-1">{t("materials.recommendedHelper")}</p>
        </CardHeader>
        <CardContent className="p-0">
          {plannedSuggestions.length === 0 ? (
            <div className="py-8 text-center text-muted-foreground">
              {t("materials.noRecommended")}
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("materials.materialName")}</TableHead>
                  <TableHead className="hidden md:table-cell">{t("materials.quantity")}</TableHead>
                  <TableHead className="hidden sm:table-cell">{t("materials.source")}</TableHead>
                  {canEdit && <TableHead className="w-[100px]" />}
                </TableRow>
              </TableHeader>
              <TableBody>
                {plannedSuggestions.map((s) => (
                  <TableRow key={s.id}>
                    <TableCell>
                      <div className="font-medium">{s.name}</div>
                      {s.description && (
                        <div className="text-xs text-muted-foreground">{s.description}</div>
                      )}
                      <div className="flex flex-wrap gap-1 mt-1">
                        {s.confidence && (
                          <Badge variant="outline" className="text-xs">
                            {t(`materials.confidence.${s.confidence}`)}
                          </Badge>
                        )}
                        {s.estimatedTotalPrice != null && (
                          <Badge variant="secondary" className="text-xs">
                            {s.estimatedTotalPrice.toFixed(2)} {s.currency}
                          </Badge>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="hidden md:table-cell text-muted-foreground">
                      {s.suggestedQuantity != null ? `${s.suggestedQuantity} ${s.unit ? unitLabel(s.unit) : ""}` : "-"}
                    </TableCell>
                    <TableCell className="hidden sm:table-cell text-muted-foreground">
                      {t(`materials.source.${s.source}`)}
                    </TableCell>
                    {canEdit && (
                      <TableCell>
                        <div className="flex gap-1">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => openAcceptSuggestion(s)}
                            title={t("materials.accept")}
                            className="p-0 h-8 w-8 text-green-700"
                          >
                            <Check className="size-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleRejectSuggestion(s)}
                            disabled={rejectingId === s.id}
                            title={t("materials.reject")}
                            className="p-0 h-8 w-8 text-destructive"
                          >
                            {rejectingId === s.id ? (
                              <Loader2 className="size-4 animate-spin" />
                            ) : (
                              <X className="size-4" />
                            )}
                          </Button>
                        </div>
                      </TableCell>
                    )}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Dialog open={usedModalOpen} onOpenChange={setUsedModalOpen}>
        <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {usedForm.id ? t("materials.editMaterial") : t("materials.addMaterial")}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div>
              <Label htmlFor="mat-name">{t("materials.materialName")} *</Label>
              <Input
                id="mat-name"
                value={usedForm.name}
                onChange={(e) => setUsedForm((f) => ({ ...f, name: e.target.value }))}
              />
            </div>
            <div>
              <Label htmlFor="mat-category">{t("materials.category")}</Label>
              <Select
                value={usedForm.category}
                onValueChange={(v) => setUsedForm((f) => ({ ...f, category: v as MaterialCategory }))}
              >
                <SelectTrigger id="mat-category">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {MATERIAL_CATEGORIES.map((c) => (
                    <SelectItem key={c} value={c}>
                      {categoryLabel(c)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="mat-qty">{t("materials.quantity")} *</Label>
                <Input
                  id="mat-qty"
                  type="number"
                  min="0"
                  step="any"
                  value={usedForm.quantity}
                  onChange={(e) => setUsedForm((f) => recalcTotal(e.target.value, f.unitPrice, f))}
                />
              </div>
              <div>
                <Label htmlFor="mat-unit">{t("materials.unit")} *</Label>
                <Select
                  value={usedForm.unit}
                  onValueChange={(v) => setUsedForm((f) => ({ ...f, unit: v as MaterialUnit }))}
                >
                  <SelectTrigger id="mat-unit">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {MATERIAL_UNITS.map((u) => (
                      <SelectItem key={u} value={u}>
                        {unitLabel(u)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-3 gap-4">
              <div>
                <Label htmlFor="mat-unit-price">{t("materials.unitPrice")}</Label>
                <Input
                  id="mat-unit-price"
                  type="number"
                  min="0"
                  step="0.01"
                  value={usedForm.unitPrice}
                  onChange={(e) => setUsedForm((f) => recalcTotal(f.quantity, e.target.value, f))}
                />
              </div>
              <div>
                <Label htmlFor="mat-total">{t("materials.totalPrice")}</Label>
                <Input
                  id="mat-total"
                  type="number"
                  min="0"
                  step="0.01"
                  value={usedForm.totalPrice}
                  onChange={(e) => setUsedForm((f) => ({ ...f, totalPrice: e.target.value }))}
                />
              </div>
              <div>
                <Label htmlFor="mat-currency">{t("projects.expenseCurrency")}</Label>
                <Select
                  value={usedForm.currency}
                  onValueChange={(v) => setUsedForm((f) => ({ ...f, currency: v ?? "EUR" }))}
                >
                  <SelectTrigger id="mat-currency">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="EUR">EUR</SelectItem>
                    <SelectItem value="CHF">CHF</SelectItem>
                    <SelectItem value="CZK">CZK</SelectItem>
                    <SelectItem value="USD">USD</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="mat-supplier">{t("materials.supplier")}</Label>
                <Input
                  id="mat-supplier"
                  value={usedForm.supplierName}
                  onChange={(e) => setUsedForm((f) => ({ ...f, supplierName: e.target.value }))}
                />
              </div>
              <div>
                <Label htmlFor="mat-date">{t("materials.dateUsed")}</Label>
                <Input
                  id="mat-date"
                  type="date"
                  value={usedForm.usedAt}
                  onChange={(e) => setUsedForm((f) => ({ ...f, usedAt: e.target.value }))}
                />
              </div>
            </div>
            <div>
              <Label htmlFor="mat-notes">{t("materials.notes")}</Label>
              <Input
                id="mat-notes"
                value={usedForm.notes}
                onChange={(e) => setUsedForm((f) => ({ ...f, notes: e.target.value }))}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setUsedModalOpen(false)}>
              {t("common.cancel")}
            </Button>
            <Button
              onClick={handleSaveUsed}
              disabled={
                saving ||
                !usedForm.name.trim() ||
                !usedForm.quantity.trim() ||
                (parseDecimal(usedForm.quantity) ?? 0) <= 0
              }
            >
              {saving ? t("common.loading") : t("common.save")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
