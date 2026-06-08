"use client";

import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { settingsCardClassName } from "./settingsStyles";

type SettingsSectionCardProps = React.ComponentProps<typeof Card>;

export function SettingsSectionCard({ className, ...props }: SettingsSectionCardProps) {
  return <Card className={cn(settingsCardClassName, className)} {...props} />;
}
