"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useI18n } from "@/i18n/I18nContext";
import { useAuth } from "@/context/AuthContext";
import { useWorkspace } from "@/context/WorkspaceContext";
import { createProject } from "@/lib/projects";
import { ArrowLeft } from "lucide-react";

export default function NewProjectPage() {
  const router = useRouter();
  const { t } = useI18n();
  const { user } = useAuth();
  const { activeWorkspace } = useWorkspace();
  const [name, setName] = useState("");
  const [addressText, setAddressText] = useState("");
  const [city, setCity] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user?.id || !activeWorkspace) return;
    setLoading(true);
    setError(null);
    try {
      const projectId = await createProject(activeWorkspace, user.id, {
        name: name.trim(),
        addressText: addressText.trim() || undefined,
        city: city.trim() || undefined,
      });
      router.push(`/app/projects/${projectId}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to create project");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <Link
        href="/app/projects"
        className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-4" />
        {t("nav.projects")}
      </Link>

      <Card>
        <CardHeader>
          <CardTitle>{t("projects.newProject")}</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label htmlFor="name" className="block text-sm font-medium mb-1">
                {t("projects.nameLabel")} *
              </label>
              <Input
                id="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder={t("projects.namePlaceholder")}
                required
              />
            </div>
            <div>
              <label htmlFor="address" className="block text-sm font-medium mb-1">
                {t("projects.addressLabel")}
              </label>
              <Input
                id="address"
                value={addressText}
                onChange={(e) => setAddressText(e.target.value)}
                placeholder={t("projects.addressPlaceholder")}
              />
            </div>
            <div>
              <label htmlFor="city" className="block text-sm font-medium mb-1">
                {t("projects.cityLabel")}
              </label>
              <Input
                id="city"
                value={city}
                onChange={(e) => setCity(e.target.value)}
                placeholder={t("projects.cityPlaceholder")}
              />
            </div>
            {error && (
              <p className="text-sm text-destructive">{error}</p>
            )}
            <div className="flex gap-2">
              <Button type="submit" disabled={loading || !name.trim()}>
                {loading ? t("common.loading") : t("projects.createProject")}
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={() => router.push("/app/projects")}
              >
                {t("common.cancel")}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
