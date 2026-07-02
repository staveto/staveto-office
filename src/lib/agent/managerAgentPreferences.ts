export type ManagerAgentPreferences = {
  enabled: boolean;
  proactiveHintsEnabled: boolean;
  allowedScreens: string[];
};

const STORAGE_KEY = "staveto.managerAgent.preferences.v1";

const DEFAULT_PREFERENCES: ManagerAgentPreferences = {
  enabled: true,
  proactiveHintsEnabled: false,
  allowedScreens: [
    "dashboard",
    "projects",
    "project_detail",
    "quotes",
    "quote_detail",
    "company_settings",
    "quote_settings",
    "new_project_wizard",
  ],
};

export function getDefaultManagerAgentPreferences(): ManagerAgentPreferences {
  return { ...DEFAULT_PREFERENCES, allowedScreens: [...DEFAULT_PREFERENCES.allowedScreens] };
}

export function loadManagerAgentPreferences(): ManagerAgentPreferences {
  if (typeof window === "undefined") return getDefaultManagerAgentPreferences();
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return getDefaultManagerAgentPreferences();
    const parsed = JSON.parse(raw) as Partial<ManagerAgentPreferences>;
    return {
      enabled: parsed.enabled ?? true,
      proactiveHintsEnabled: parsed.proactiveHintsEnabled ?? false,
      allowedScreens: Array.isArray(parsed.allowedScreens)
        ? parsed.allowedScreens.filter((s): s is string => typeof s === "string")
        : [...DEFAULT_PREFERENCES.allowedScreens],
    };
  } catch {
    return getDefaultManagerAgentPreferences();
  }
}

export function saveManagerAgentPreferences(prefs: ManagerAgentPreferences): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs));
}

export function isManagerAgentEnabledForScreen(
  prefs: ManagerAgentPreferences,
  screenType: string
): boolean {
  if (!prefs.enabled) return false;
  return prefs.allowedScreens.includes(screenType);
}
