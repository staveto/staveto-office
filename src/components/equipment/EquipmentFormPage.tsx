"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { useI18n } from "@/i18n/I18nContext";
import { useAuth } from "@/context/AuthContext";
import {
  UserEquipmentForm,
  EMPTY_USER_EQUIPMENT_FORM,
  type UserEquipmentFormSubmitPayload,
  type UserEquipmentFormValues,
} from "@/components/equipment/UserEquipmentForm";
import { eq } from "@/components/equipment/equipmentFormStyles";
import {
  createMyEquipment,
  deleteMyEquipment,
  getMyEquipment,
  updateMyEquipment,
  type EquipmentCategory,
} from "@/services/equipment";
import {
  removeUserEquipmentPhoto,
  uploadUserEquipmentPhoto,
} from "@/services/equipment/userEquipmentPhotoService";

function toFormValues(doc: {
  name: string;
  category: string;
  kind?: string;
  model?: string;
  serialNumber?: string;
  internalCode?: string;
  locationText?: string;
  notes?: string;
  status: UserEquipmentFormValues["status"];
}): UserEquipmentFormValues {
  return {
    name: doc.name,
    category: (doc.category as EquipmentCategory) || "other",
    kind: doc.kind ?? "",
    model: doc.model ?? "",
    serialNumber: doc.serialNumber ?? "",
    internalCode: doc.internalCode ?? "",
    locationText: doc.locationText ?? "",
    notes: doc.notes ?? "",
    status: doc.status,
  };
}

type EquipmentFormPageProps = {
  mode: "create" | "edit";
  equipmentId?: string;
};

export function EquipmentFormPage({ mode, equipmentId }: EquipmentFormPageProps) {
  const router = useRouter();
  const { t } = useI18n();
  const { user } = useAuth();
  const isNew = mode === "create";

  const [initialValues, setInitialValues] = useState<UserEquipmentFormValues>(EMPTY_USER_EQUIPMENT_FORM);
  const [initialPhotoUrl, setInitialPhotoUrl] = useState<string | null>(null);
  const [existingPhotoPath, setExistingPhotoPath] = useState<string | null>(null);
  const [loading, setLoading] = useState(!isNew);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isNew || !user?.id || !equipmentId) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const doc = await getMyEquipment(equipmentId);
        if (cancelled) return;
        if (!doc) {
          setError(t("equipment.notFound"));
          return;
        }
        setInitialValues(toFormValues(doc));
        setInitialPhotoUrl(doc.photoUrl ?? null);
        setExistingPhotoPath(doc.photoPath ?? null);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : t("equipment.loadError"));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [equipmentId, isNew, user?.id, t]);

  const buildPayload = (values: UserEquipmentFormValues) => ({
    name: values.name.trim(),
    category: values.category,
    kind: values.kind.trim() || undefined,
    model: values.model.trim() || undefined,
    serialNumber: values.serialNumber.trim() || undefined,
    internalCode: values.internalCode.trim() || undefined,
    locationText: values.locationText.trim() || undefined,
    notes: values.notes.trim() || undefined,
  });

  const handleSubmit = async ({ values, photoFile, removePhoto }: UserEquipmentFormSubmitPayload) => {
    if (!user?.id) return;
    setSaving(true);
    setError(null);
    try {
      const base = buildPayload(values);

      if (isNew) {
        const newId = await createMyEquipment(base);
        if (photoFile) {
          const mimeType = photoFile.type || "image/jpeg";
          const { photoUrl, photoPath } = await uploadUserEquipmentPhoto(
            user.id,
            newId,
            photoFile,
            mimeType
          );
          await updateMyEquipment(newId, { photoUrl, photoPath });
        }
        router.replace(`/app/equipment/${newId}`);
        return;
      }

      if (!equipmentId) return;
      const editPayload = { ...base, status: values.status };

      if (photoFile) {
        if (existingPhotoPath) await removeUserEquipmentPhoto(existingPhotoPath);
        const mimeType = photoFile.type || "image/jpeg";
        const { photoUrl, photoPath } = await uploadUserEquipmentPhoto(
          user.id,
          equipmentId,
          photoFile,
          mimeType
        );
        await updateMyEquipment(equipmentId, { ...editPayload, photoUrl, photoPath });
      } else if (removePhoto && existingPhotoPath) {
        await removeUserEquipmentPhoto(existingPhotoPath);
        await updateMyEquipment(equipmentId, { ...editPayload, photoUrl: null, photoPath: null });
      } else {
        await updateMyEquipment(equipmentId, editPayload);
      }

      router.push(`/app/equipment/${equipmentId}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : t("equipment.saveError"));
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (isNew || !equipmentId || !confirm(t("equipment.confirmDelete"))) return;
    setDeleting(true);
    try {
      if (existingPhotoPath) await removeUserEquipmentPhoto(existingPhotoPath);
      await deleteMyEquipment(equipmentId);
      router.push("/app/equipment");
    } catch (e) {
      setError(e instanceof Error ? e.message : t("equipment.deleteError"));
      setDeleting(false);
    }
  };

  const cancelHref = isNew ? "/app/equipment" : `/app/equipment/${equipmentId}`;

  return (
    <div className={eq.pageWrap}>
      <div>
        <Link
          href={cancelHref}
          className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground mb-3"
        >
          <ArrowLeft className="size-4" />
          {isNew ? t("equipment.title") : t("equipmentTab.detailTitle")}
        </Link>
        <h1 className={eq.pageTitle}>{isNew ? t("equipment.add") : t("equipment.edit")}</h1>
        <p className={eq.pageLead}>{t("equipment.formPageLead")}</p>
      </div>

      <Card className="border-[#E2E8F0] shadow-sm">
        <CardContent className="p-5 sm:p-6 lg:p-8">
          <UserEquipmentForm
            mode={mode}
            initialValues={initialValues}
            initialPhotoUrl={initialPhotoUrl}
            onSubmit={handleSubmit}
            onCancel={() => router.push(cancelHref)}
            onDelete={!isNew ? handleDelete : undefined}
            loading={loading}
            saving={saving}
            deleting={deleting}
            error={error}
          />
        </CardContent>
      </Card>
    </div>
  );
}
