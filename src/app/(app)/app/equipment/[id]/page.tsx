"use client";

import { useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { useI18n } from "@/i18n/I18nContext";
import { EquipmentDetailPanel } from "@/components/equipment/EquipmentDetailPanel";
import { eq } from "@/components/equipment/equipmentFormStyles";

export default function EquipmentDetailPage() {
  const params = useParams();
  const router = useRouter();
  const { t } = useI18n();
  const id = params.id as string;

  useEffect(() => {
    if (id === "new") {
      router.replace("/app/equipment/new");
    }
  }, [id, router]);

  if (id === "new") {
    return null;
  }

  return (
    <div className={eq.pageWrap}>
      <Link
        href="/app/equipment"
        className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground mb-3"
      >
        <ArrowLeft className="size-4" />
        {t("equipment.title")}
      </Link>
      <EquipmentDetailPanel equipmentId={id} />
    </div>
  );
}
