"use client";

import { useParams } from "next/navigation";
import { EquipmentServiceRuleForm } from "@/components/equipment/EquipmentServiceRuleForm";

export default function EditEquipmentServiceRulePage() {
  const params = useParams();
  const equipmentId = params.id as string;
  const ruleId = params.ruleId as string;
  return <EquipmentServiceRuleForm equipmentId={equipmentId} ruleId={ruleId} />;
}
