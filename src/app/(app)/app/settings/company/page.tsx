"use client";

import { CompanyProfileSettings } from "@/components/settings/CompanyProfileSettings";
import { WorkTypeSettings } from "@/components/settings/WorkTypeSettings";
import { isLegacyProjectTypeSettingsEnabled } from "@/lib/projectCreationFeature";

/**
 * WorkTypeSettings is legacy for the pre–Phase-1A wizard.
 * Hidden by default; enable with NEXT_PUBLIC_ENABLE_LEGACY_PROJECT_TYPE_SETTINGS=1.
 * Stored org.enabledWorkTypes values are kept — do not delete without migration.
 */
export default function CompanySettingsPage() {
  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <CompanyProfileSettings />
      {isLegacyProjectTypeSettingsEnabled() ? <WorkTypeSettings /> : null}
    </div>
  );
}
