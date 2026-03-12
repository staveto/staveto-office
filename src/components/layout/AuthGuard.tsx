"use client";

import { useEffect } from "react";
import { useRouter, usePathname } from "next/navigation";
import { useAuth, isOnboardingCompleted } from "@/context/AuthContext";

const PUBLIC_PATHS = ["/login", "/register", "/join", "/forgot-password"];

export function AuthGuard({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const { user, profile, loading } = useAuth();

  useEffect(() => {
    if (loading) return;
    const isPublic = PUBLIC_PATHS.some((p) => pathname.startsWith(p));
    if (!user && !isPublic) {
      const next = encodeURIComponent(pathname);
      router.replace(`/login?next=${next}`);
      return;
    }
    if (user && !isPublic && pathname !== "/onboarding") {
      const completed = isOnboardingCompleted(profile);
      if (!completed) {
        router.replace("/onboarding");
      }
    }
  }, [user, profile, loading, pathname, router]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="animate-spin size-8 border-2 border-primary border-t-transparent rounded-full" />
      </div>
    );
  }

  const isPublic = PUBLIC_PATHS.some((p) => pathname.startsWith(p));
  if (!user && !isPublic) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="animate-spin size-8 border-2 border-primary border-t-transparent rounded-full" />
      </div>
    );
  }

  if (user && !isPublic && pathname !== "/onboarding") {
    const completed = isOnboardingCompleted(profile);
    if (!completed) {
      return (
        <div className="min-h-screen flex items-center justify-center bg-background">
          <div className="animate-spin size-8 border-2 border-primary border-t-transparent rounded-full" />
        </div>
      );
    }
  }

  return <>{children}</>;
}
