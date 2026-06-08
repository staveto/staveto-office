"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import { AlertCircle, Camera, Loader2, Trash2, X } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useI18n } from "@/i18n/I18nContext";
import type { EquipmentCategory, UserEquipmentStatus } from "@/services/equipment/types";
import { EquipmentCategoryChips } from "./EquipmentCategoryChips";
import { EquipmentStatusChips } from "./EquipmentStatusChips";
import { eq } from "./equipmentFormStyles";

export type UserEquipmentFormValues = {
  name: string;
  category: EquipmentCategory;
  kind: string;
  model: string;
  serialNumber: string;
  internalCode: string;
  locationText: string;
  notes: string;
  status: UserEquipmentStatus;
};

export const EMPTY_USER_EQUIPMENT_FORM: UserEquipmentFormValues = {
  name: "",
  category: "other",
  kind: "",
  model: "",
  serialNumber: "",
  internalCode: "",
  locationText: "",
  notes: "",
  status: "available",
};

export type UserEquipmentFormSubmitPayload = {
  values: UserEquipmentFormValues;
  photoFile: File | null;
  removePhoto: boolean;
};

type UserEquipmentFormProps = {
  mode: "create" | "edit";
  initialValues: UserEquipmentFormValues;
  initialPhotoUrl?: string | null;
  onSubmit: (payload: UserEquipmentFormSubmitPayload) => Promise<void>;
  onCancel: () => void;
  onDelete?: () => void;
  loading?: boolean;
  saving?: boolean;
  deleting?: boolean;
  error?: string | null;
};

function Field({
  id,
  label,
  children,
  error: fieldError,
}: {
  id?: string;
  label: string;
  children: React.ReactNode;
  error?: string | null;
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id} className={eq.label}>
        {label}
      </Label>
      {children}
      {fieldError ? <p className="text-sm text-destructive">{fieldError}</p> : null}
    </div>
  );
}

function Section({
  title,
  muted,
  children,
}: {
  title: string;
  muted?: boolean;
  children: React.ReactNode;
}) {
  return (
    <section className={muted ? eq.sectionMuted : eq.section}>
      <h3 className={eq.sectionTitle}>{title}</h3>
      {children}
    </section>
  );
}

export function UserEquipmentForm({
  mode,
  initialValues,
  initialPhotoUrl,
  onSubmit,
  onCancel,
  onDelete,
  loading,
  saving,
  deleting,
  error,
}: UserEquipmentFormProps) {
  const { t } = useI18n();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [values, setValues] = useState<UserEquipmentFormValues>(initialValues);
  const [nameError, setNameError] = useState<string | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(initialPhotoUrl ?? null);
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [removePhoto, setRemovePhoto] = useState(false);

  useEffect(() => {
    setValues(initialValues);
  }, [initialValues]);

  useEffect(() => {
    setPhotoPreview(initialPhotoUrl ?? null);
    setPhotoFile(null);
    setRemovePhoto(false);
  }, [initialPhotoUrl]);

  const setField = <K extends keyof UserEquipmentFormValues>(
    key: K,
    value: UserEquipmentFormValues[K]
  ) => {
    setValues((prev) => ({ ...prev, [key]: value }));
    if (key === "name" && nameError) setNameError(null);
  };

  const handlePhotoSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setPhotoFile(file);
    setRemovePhoto(false);
    setPhotoPreview(URL.createObjectURL(file));
    e.target.value = "";
  };

  const handleRemovePhoto = () => {
    setPhotoFile(null);
    setPhotoPreview(null);
    setRemovePhoto(true);
  };

  const handleSubmit = async () => {
    if (!values.name.trim()) {
      setNameError(t("equipment.nameRequired"));
      return;
    }
    await onSubmit({ values, photoFile, removePhoto });
  };

  if (loading) {
    return (
      <div className="flex justify-center py-16">
        <Loader2 className="size-7 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {error ? (
        <div className={eq.errorBanner} role="alert">
          <div className="flex items-start gap-2">
            <AlertCircle className="size-4 mt-0.5 shrink-0" />
            <span>{error}</span>
          </div>
        </div>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_260px]">
        <div className="space-y-5">
          <Section title={t("equipment.formSectionBasics")}>
            <Field id="eq-name" label={t("equipment.formName")} error={nameError}>
              <Input
                id="eq-name"
                value={values.name}
                onChange={(e) => setField("name", e.target.value)}
                placeholder={t("equipment.formNamePlaceholder")}
                className="h-11 text-base"
                aria-invalid={!!nameError}
              />
            </Field>

            <Field label={t("equipmentTab.formCategoryType")}>
              <EquipmentCategoryChips
                value={values.category}
                onChange={(category) => setField("category", category)}
                disabled={saving}
              />
            </Field>
          </Section>

          <Section title={t("equipment.formSectionType")} muted>
            <div className={eq.fieldGrid}>
              <Field id="eq-kind" label={t("equipmentTab.formKindOptional")}>
                <Input
                  id="eq-kind"
                  value={values.kind}
                  onChange={(e) => setField("kind", e.target.value)}
                  placeholder={t("equipmentTab.formKindPlaceholder")}
                />
              </Field>
              <Field id="eq-model" label={t("equipmentTab.formModelOptional")}>
                <Input
                  id="eq-model"
                  value={values.model}
                  onChange={(e) => setField("model", e.target.value)}
                  placeholder={t("equipmentTab.formModelPlaceholder")}
                />
              </Field>
            </div>
          </Section>

          {mode === "edit" ? (
            <Section title={t("equipmentTab.formStatus")}>
              <EquipmentStatusChips
                value={values.status}
                onChange={(status) => setField("status", status)}
                disabled={saving}
              />
            </Section>
          ) : null}

          <Section title={t("equipment.formSectionIdentification")}>
            <div className={eq.fieldGrid}>
              <Field id="eq-serial" label={t("equipment.serialNumber")}>
                <Input
                  id="eq-serial"
                  value={values.serialNumber}
                  onChange={(e) => setField("serialNumber", e.target.value)}
                  placeholder={t("equipmentTab.fieldSerial")}
                />
              </Field>
              <Field id="eq-code" label={t("equipmentTab.fieldInternalCode")}>
                <Input
                  id="eq-code"
                  value={values.internalCode}
                  onChange={(e) => setField("internalCode", e.target.value)}
                />
              </Field>
            </div>
          </Section>

          <Section title={t("equipment.formSectionLocationNotes")}>
            <Field id="eq-location" label={t("equipment.location")}>
              <Input
                id="eq-location"
                value={values.locationText}
                onChange={(e) => setField("locationText", e.target.value)}
                placeholder={t("equipment.formLocationPlaceholder")}
              />
            </Field>
            <Field id="eq-notes" label={t("equipmentTab.notes")}>
              <Textarea
                id="eq-notes"
                value={values.notes}
                onChange={(e) => setField("notes", e.target.value)}
                rows={4}
                className="min-h-[100px] resize-y"
              />
            </Field>
          </Section>
        </div>

        <aside>
          <div className={eq.photoCard}>
            <h3 className={eq.sectionTitle}>{t("equipmentTab.photoSection")}</h3>
            {photoPreview ? (
              <div className={eq.photoPreview}>
                <Image
                  src={photoPreview}
                  alt=""
                  fill
                  className="object-cover"
                  unoptimized
                />
                <Button
                  type="button"
                  variant="secondary"
                  size="icon"
                  className="absolute top-2 right-2 size-8 shadow-sm"
                  onClick={handleRemovePhoto}
                  disabled={saving}
                >
                  <X className="size-4" />
                </Button>
              </div>
            ) : (
              <div
                className={`${eq.photoPreview} flex flex-col items-center justify-center gap-2 text-muted-foreground`}
              >
                <Camera className="size-8 opacity-40" />
                <p className="text-xs text-center px-4">{t("equipment.photoEmptyHint")}</p>
              </div>
            )}
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={handlePhotoSelect}
            />
            <Button
              type="button"
              variant="outline"
              className="w-full border-[#E06737] text-[#E06737] hover:bg-[#E06737]/10"
              onClick={() => fileInputRef.current?.click()}
              disabled={saving}
            >
              <Camera className="size-4 mr-2" />
              {photoPreview ? t("equipment.changePhoto") : t("equipment.addEquipmentPhoto")}
            </Button>
          </div>
        </aside>
      </div>

      <div className={eq.actionBar}>
        <Button type="button" onClick={() => void handleSubmit()} disabled={saving} className="min-w-[120px]">
          {saving ? (
            <>
              <Loader2 className="size-4 mr-2 animate-spin" />
              {t("common.loading")}
            </>
          ) : (
            t("common.save")
          )}
        </Button>
        <button type="button" onClick={onCancel} className={buttonVariants({ variant: "outline" })}>
          {t("common.cancel")}
        </button>
        {mode === "edit" && onDelete ? (
          <Button
            type="button"
            variant="ghost"
            className="text-destructive ml-auto"
            onClick={onDelete}
            disabled={deleting}
          >
            {deleting ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <>
                <Trash2 className="size-4 mr-2" />
                {t("common.delete")}
              </>
            )}
          </Button>
        ) : null}
      </div>
    </div>
  );
}
