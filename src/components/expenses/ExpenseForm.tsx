"use client";

import { useEffect, useMemo, useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useI18n } from "@/i18n/I18nContext";
import {
  EXPENSE_CATEGORIES,
  computeTravelAmount,
  type ExpenseCategory,
  type TravelExpenseData,
} from "@/lib/expenses";

export type ExpenseFormValues = {
  title: string;
  amount: string;
  currency: string;
  date: string;
  category: ExpenseCategory;
  note: string;
  supplierName: string;
  supplierIco: string;
  travel: {
    fromAddress: string;
    toAddress: string;
    distanceKm: string;
    ratePerKm: string;
    roundTrip: boolean;
    billableToClient: boolean;
  };
};

export const EMPTY_EXPENSE_FORM: ExpenseFormValues = {
  title: "",
  amount: "",
  currency: "EUR",
  date: new Date().toISOString().slice(0, 10),
  category: "OTHER",
  note: "",
  supplierName: "",
  supplierIco: "",
  travel: {
    fromAddress: "",
    toAddress: "",
    distanceKm: "",
    ratePerKm: "0.2",
    roundTrip: false,
    billableToClient: false,
  },
};

type ExpenseFormProps = {
  values: ExpenseFormValues;
  onChange: (values: ExpenseFormValues) => void;
  idPrefix?: string;
};

export function ExpenseForm({ values, onChange, idPrefix = "exp" }: ExpenseFormProps) {
  const { t } = useI18n();
  const [amountTouched, setAmountTouched] = useState(false);

  const travelPreview = useMemo((): TravelExpenseData | null => {
    const km = parseFloat(values.travel.distanceKm);
    const rate = parseFloat(values.travel.ratePerKm);
    if (isNaN(km) || isNaN(rate) || km <= 0 || rate <= 0) return null;
    return {
      fromAddress: values.travel.fromAddress,
      toAddress: values.travel.toAddress,
      distanceKm: km,
      ratePerKm: rate,
      roundTrip: values.travel.roundTrip,
      billableToClient: values.travel.billableToClient,
    };
  }, [values.travel]);

  useEffect(() => {
    if (values.category !== "TRAVEL" || amountTouched || !travelPreview) return;
    const computed = computeTravelAmount(travelPreview);
    onChange({ ...values, amount: String(computed) });
  }, [values.category, travelPreview, amountTouched]);

  const setField = <K extends keyof ExpenseFormValues>(key: K, value: ExpenseFormValues[K]) => {
    onChange({ ...values, [key]: value });
  };

  const setTravelField = <K extends keyof ExpenseFormValues["travel"]>(
    key: K,
    value: ExpenseFormValues["travel"][K]
  ) => {
    onChange({ ...values, travel: { ...values.travel, [key]: value } });
  };

  return (
    <div className="space-y-4">
      <div>
        <Label htmlFor={`${idPrefix}-title`}>{t("estimates.titleCol")} *</Label>
        <Input
          id={`${idPrefix}-title`}
          value={values.title}
          onChange={(e) => setField("title", e.target.value)}
          placeholder={t("projects.expenseTitlePlaceholder")}
        />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <Label htmlFor={`${idPrefix}-amount`}>{t("estimates.totalCol")} *</Label>
          <Input
            id={`${idPrefix}-amount`}
            type="number"
            min="0"
            step="0.01"
            value={values.amount}
            onChange={(e) => {
              setAmountTouched(true);
              setField("amount", e.target.value);
            }}
          />
        </div>
        <div>
          <Label htmlFor={`${idPrefix}-currency`}>{t("projects.expenseCurrency")}</Label>
          <Select value={values.currency} onValueChange={(v) => setField("currency", v ?? "EUR")}>
            <SelectTrigger id={`${idPrefix}-currency`}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="EUR">EUR</SelectItem>
              <SelectItem value="CZK">CZK</SelectItem>
              <SelectItem value="CHF">CHF</SelectItem>
              <SelectItem value="USD">USD</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <Label htmlFor={`${idPrefix}-date`}>{t("projects.expenseDate")}</Label>
          <Input
            id={`${idPrefix}-date`}
            type="date"
            value={values.date}
            onChange={(e) => setField("date", e.target.value)}
          />
        </div>
        <div>
          <Label htmlFor={`${idPrefix}-category`}>{t("projects.expenseCategory")}</Label>
          <Select
            value={values.category}
            onValueChange={(v) => setField("category", (v ?? "OTHER") as ExpenseCategory)}
          >
            <SelectTrigger id={`${idPrefix}-category`}>
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

      <div className="grid grid-cols-2 gap-4">
        <div>
          <Label htmlFor={`${idPrefix}-supplier`}>{t("expenses.supplierName")}</Label>
          <Input
            id={`${idPrefix}-supplier`}
            value={values.supplierName}
            onChange={(e) => setField("supplierName", e.target.value)}
            placeholder={t("expenses.supplierNamePlaceholder")}
          />
        </div>
        <div>
          <Label htmlFor={`${idPrefix}-ico`}>{t("expenses.supplierIco")}</Label>
          <Input
            id={`${idPrefix}-ico`}
            value={values.supplierIco}
            onChange={(e) => setField("supplierIco", e.target.value)}
          />
        </div>
      </div>

      {values.category === "TRAVEL" && (
        <div className="space-y-3 rounded-lg border border-border p-4">
          <p className="text-sm font-medium">{t("expenses.travel.routeTitle")}</p>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <Label htmlFor={`${idPrefix}-from`}>{t("expenses.travel.from")}</Label>
              <Input
                id={`${idPrefix}-from`}
                value={values.travel.fromAddress}
                onChange={(e) => setTravelField("fromAddress", e.target.value)}
              />
            </div>
            <div>
              <Label htmlFor={`${idPrefix}-to`}>{t("expenses.travel.to")}</Label>
              <Input
                id={`${idPrefix}-to`}
                value={values.travel.toAddress}
                onChange={(e) => setTravelField("toAddress", e.target.value)}
              />
            </div>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <Label htmlFor={`${idPrefix}-km`}>{t("expenses.travel.distanceKm")}</Label>
              <Input
                id={`${idPrefix}-km`}
                type="number"
                min="0"
                step="0.1"
                value={values.travel.distanceKm}
                onChange={(e) => setTravelField("distanceKm", e.target.value)}
              />
            </div>
            <div>
              <Label htmlFor={`${idPrefix}-rate`}>{t("expenses.travel.ratePerKm")}</Label>
              <Input
                id={`${idPrefix}-rate`}
                type="number"
                min="0"
                step="0.01"
                value={values.travel.ratePerKm}
                onChange={(e) => setTravelField("ratePerKm", e.target.value)}
              />
            </div>
          </div>
          <div className="flex flex-col gap-2">
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={values.travel.roundTrip}
                onChange={(e) => setTravelField("roundTrip", e.target.checked)}
                className="size-4 rounded border-border"
              />
              {t("expenses.travel.roundTrip")}
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={values.travel.billableToClient}
                onChange={(e) => setTravelField("billableToClient", e.target.checked)}
                className="size-4 rounded border-border"
              />
              {t("expenses.travel.billableToClient")}
            </label>
          </div>
          {travelPreview && (
            <p className="text-sm text-muted-foreground">
              {t("expenses.travel.computedAmount")}: {computeTravelAmount(travelPreview).toFixed(2)}{" "}
              {values.currency}
            </p>
          )}
        </div>
      )}

      <div>
        <Label htmlFor={`${idPrefix}-note`}>{t("projects.expenseNote")}</Label>
        <Input
          id={`${idPrefix}-note`}
          value={values.note}
          onChange={(e) => setField("note", e.target.value)}
          placeholder={t("projects.expenseNotePlaceholder")}
        />
      </div>
    </div>
  );
}

export function expenseFormToPayload(values: ExpenseFormValues) {
  const amount = parseFloat(values.amount);
  const payload = {
    title: values.title.trim(),
    amount,
    currency: values.currency,
    date: values.date,
    category: values.category,
    note: values.note.trim() || undefined,
    supplierName: values.supplierName.trim() || undefined,
    supplierIco: values.supplierIco.trim() || undefined,
    travel: null as TravelExpenseData | null,
  };

  if (values.category === "TRAVEL") {
    const km = parseFloat(values.travel.distanceKm);
    const rate = parseFloat(values.travel.ratePerKm);
    if (!isNaN(km) && !isNaN(rate) && km > 0 && rate > 0) {
      payload.travel = {
        fromAddress: values.travel.fromAddress.trim(),
        toAddress: values.travel.toAddress.trim(),
        distanceKm: km,
        ratePerKm: rate,
        roundTrip: values.travel.roundTrip,
        billableToClient: values.travel.billableToClient,
      };
    }
  }

  return payload;
}

export function expenseDocToFormValues(exp: {
  title: string;
  amount: number | null;
  currency: string;
  date: string;
  category?: ExpenseCategory;
  note?: string;
  supplierName?: string;
  supplierIco?: string;
  travel?: TravelExpenseData;
}): ExpenseFormValues {
  return {
    title: exp.title,
    amount: exp.amount != null ? String(exp.amount) : "",
    currency: exp.currency || "EUR",
    date: exp.date ? exp.date.slice(0, 10) : new Date().toISOString().slice(0, 10),
    category: exp.category ?? "OTHER",
    note: exp.note ?? "",
    supplierName: exp.supplierName ?? "",
    supplierIco: exp.supplierIco ?? "",
    travel: {
      fromAddress: exp.travel?.fromAddress ?? "",
      toAddress: exp.travel?.toAddress ?? "",
      distanceKm: exp.travel ? String(exp.travel.distanceKm) : "",
      ratePerKm: exp.travel ? String(exp.travel.ratePerKm) : "0.2",
      roundTrip: exp.travel?.roundTrip ?? false,
      billableToClient: exp.travel?.billableToClient ?? false,
    },
  };
}

export function isExpenseFormValid(values: ExpenseFormValues): boolean {
  const amount = parseFloat(values.amount);
  return !!values.title.trim() && !isNaN(amount) && amount >= 0;
}
