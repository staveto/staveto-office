"use client";



import { useEffect } from "react";

import { useRouter } from "next/navigation";

import { Loader2 } from "lucide-react";

import { useAuth, isOnboardingCompleted } from "@/context/AuthContext";

import { WebOnboardingWizard } from "@/components/onboarding/MobileAlignedOnboardingWizard";

import { OnboardingPageLayout } from "@/components/onboarding/OnboardingPageLayout";



export default function OnboardingPage() {

  const router = useRouter();

  const { user, profile, loading } = useAuth();



  useEffect(() => {

    if (!loading && profile && isOnboardingCompleted(profile)) {

      router.replace("/app");

    }

  }, [loading, profile, router]);



  if (loading || !user) {

    return (

      <OnboardingPageLayout>

        <div className="flex min-h-[320px] items-center justify-center rounded-2xl bg-white/95 shadow-xl">

          <Loader2 className="size-8 animate-spin text-[#1D376A]" />

        </div>

      </OnboardingPageLayout>

    );

  }



  if (profile && isOnboardingCompleted(profile)) {

    return null;

  }



  return (

    <OnboardingPageLayout>

      <WebOnboardingWizard />

    </OnboardingPageLayout>

  );

}


