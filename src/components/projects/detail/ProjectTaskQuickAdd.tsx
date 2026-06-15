"use client";

import { useState } from "react";
import { Plus } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

type Props = {
  phaseLabel?: string;
  onSubmit: (title: string) => void;
  busy?: boolean;
  t: (key: string, params?: Record<string, string | number>) => string;
  autoFocus?: boolean;
};

export function ProjectTaskQuickAdd({ phaseLabel, onSubmit, busy, t, autoFocus }: Props) {
  const [title, setTitle] = useState("");

  const submit = () => {
    const trimmed = title.trim();
    if (!trimmed || busy) return;
    onSubmit(trimmed);
    setTitle("");
  };

  return (
    <div className="flex gap-2">
      <Input
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder={
          phaseLabel
            ? t("projects.planning.quickAddInPhase", { phase: phaseLabel })
            : t("projects.newTaskPlaceholder")
        }
        className="h-8 text-sm"
        autoFocus={autoFocus}
        disabled={busy}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            submit();
          }
        }}
      />
      <Button
        type="button"
        size="sm"
        className="h-8 shrink-0 bg-[#1D376A] hover:bg-[#162d58]"
        disabled={busy || !title.trim()}
        onClick={submit}
      >
        <Plus className="size-3.5" />
      </Button>
    </div>
  );
}
