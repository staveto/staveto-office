"use client";

import { useParams } from "next/navigation";
import { EquipmentServiceRuleForm } from "@/components/equipment/EquipmentServiceRuleForm";

export default function NewEquipmentServiceRulePage() {
  const params = useParams();
  const equipmentId = params.id as string;
  return <EquipmentServiceRuleForm equipmentId={equipmentId} />;
}
