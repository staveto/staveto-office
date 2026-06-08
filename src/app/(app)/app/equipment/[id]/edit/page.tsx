"use client";

import { useParams } from "next/navigation";
import { EquipmentFormPage } from "@/components/equipment/EquipmentFormPage";

export default function EditEquipmentPage() {
  const params = useParams();
  const id = params.id as string;
  return <EquipmentFormPage mode="edit" equipmentId={id} />;
}
