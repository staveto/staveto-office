"use client";

import { useEffect, useState } from "react";
import { Monitor, Moon, Sun } from "lucide-react";
import { useTheme } from "next-themes";
import { useI18n } from "@/i18n/I18nContext";
import { cn } from "@/lib/utils";

export function ThemeToggle() {
  const { theme, setTheme } = useTheme();
  const { t } = useI18n();
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  if (!mounted) {
    return (
      <span className="inline-flex size-9 items-center justify-center rounded-lg border border-border/60 bg-background/80" />
    );
  }

  const options = [
    { id: "light", icon: Sun, label: t("theme.light") },
    { id: "dark", icon: Moon, label: t("theme.dark") },
    { id: "system", icon: Monitor, label: t("theme.system") },
  ] as const;

  return (
    <div
      className="hidden items-center rounded-lg border border-border/60 bg-background/80 p-0.5 sm:flex"
      role="group"
      aria-label={t("theme.label")}
    >
      {options.map(({ id, icon: Icon, label }) => (
        <button
          key={id}
          type="button"
          onClick={() => setTheme(id)}
          className={cn(
            "flex size-8 items-center justify-center rounded-md text-muted-foreground transition-colors",
            "hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40",
            theme === id && "bg-muted text-foreground shadow-sm"
          )}
          aria-pressed={theme === id}
          title={label}
        >
          <Icon className="size-4" aria-hidden />
          <span className="sr-only">{label}</span>
        </button>
      ))}
    </div>
  );
}
