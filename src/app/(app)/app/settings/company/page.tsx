"use client";

import { CompanyProfileSettings } from "@/components/settings/CompanyProfileSettings";
import { WorkTypeSettings } from "@/components/settings/WorkTypeSettings";

export default function CompanySettingsPage() {
  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <CompanyProfileSettings />
      <WorkTypeSettings />
    </div>
  );
}
