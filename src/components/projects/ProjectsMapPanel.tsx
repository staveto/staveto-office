"use client";

import dynamic from "next/dynamic";
import { Loader2 } from "lucide-react";
import type { ProjectDoc } from "@/lib/projects";

const ProjectsMapView = dynamic(
  () => import("./ProjectsMapView").then((m) => m.ProjectsMapView),
  {
    ssr: false,
    loading: () => (
      <div className="flex min-h-[28rem] items-center justify-center rounded-xl border border-[#1D376A]/12 bg-muted/30">
        <Loader2 className="size-8 animate-spin text-[#1D376A]/60" aria-hidden />
      </div>
    ),
  }
);

type ProjectsMapPanelProps = {
  projects: ProjectDoc[];
  t: (key: string, params?: Record<string, string | number>) => string;
};

export function ProjectsMapPanel({ projects, t }: ProjectsMapPanelProps) {
  return <ProjectsMapView projects={projects} t={t} />;
}
