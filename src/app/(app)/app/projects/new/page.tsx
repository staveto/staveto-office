"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { NewJobForm } from "@/components/jobs/new/NewJobForm";
import { nj } from "@/components/jobs/new/newJobFormStyles";
import { useWorkspaceProduct } from "@/hooks/useWorkspaceProduct";

export default function NewProjectPage() {
  const router = useRouter();
  const { isCompany, isField } = useWorkspaceProduct();

  useEffect(() => {
    if (isCompany && isField) {
      router.replace("/app/projects");
    }
  }, [isCompany, isField, router]);

  if (isCompany && isField) {
    return null;
  }

  return (
    <div
      className={`${nj.pageWrap} -mx-4 md:-mx-6 -mt-4 md:-mt-6 px-4 md:px-6 py-10 md:py-12`}
    >
      <div className="mx-auto max-w-[1180px]">
        <NewJobForm />
      </div>
    </div>
  );
}
