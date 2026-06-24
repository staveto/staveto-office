import type { ProjectDoc } from "@/lib/projects";

/** BUILD/TRADE projects eligible as copy sources (aligned with mobile clone picker). */
export function filterCopySourceProjects(projects: ProjectDoc[]): ProjectDoc[] {
  return projects.filter((p) => {
    const pt = (p.projectType ?? "").toUpperCase();
    if (!pt) return true;
    return pt === "BUILD" || pt === "TRADE";
  });
}
