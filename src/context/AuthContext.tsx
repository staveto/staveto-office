"use client";

import React, { createContext, useContext, useEffect, useState } from "react";
import {
  getAuthInstance,
  onAuthStateChanged,
  logout as fbLogout,
  signInWithEmail,
  signUpWithEmail,
  signInWithGoogle,
} from "@/lib/firebase";
import { getCallable } from "@/lib/firebase";
import {
  getUserProfile,
  ensureUserProfile,
  isOnboardingCompleted,
  type UserProfile,
} from "@/lib/userProfile";
import type { User as FirebaseUser } from "firebase/auth";

export type BillingStatus = {
  status: "trial" | "active" | "expired";
  isPro: boolean;
  trialEndsAt: string | null;
  remainingTrialDays: number;
  currentPeriodEndAt: string | null;
};

export type User = {
  id: string;
  email: string;
  name?: string;
  firstName?: string;
  lastName?: string;
  billing?: BillingStatus | null;
};

type AuthState = {
  user: User | null;
  profile: UserProfile | null;
  loading: boolean;
};

type AuthContextValue = AuthState & {
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (email: string, password: string, displayName?: string) => Promise<void>;
  signUpWithGoogle: () => Promise<void>;
  signOut: () => Promise<void>;
  logout: () => Promise<void>;
  refreshUser: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

async function fetchBillingStatus(uid: string): Promise<BillingStatus | null> {
  try {
    const res = await getCallable("getBillingStatus")({});
    const data = res?.data as BillingStatus | undefined;
    return data ?? null;
  } catch {
    return null;
  }
}

function mapFirebaseUser(fb: FirebaseUser): User {
  return {
    id: fb.uid,
    email: fb.email ?? "",
    name: fb.displayName ?? undefined,
    firstName: fb.displayName?.split(" ")[0],
    lastName: fb.displayName?.split(" ").slice(1).join(" ") || undefined,
  };
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<AuthState>({
    user: null,
    profile: null,
    loading: true,
  });

  const loadUserAndProfile = async (fb: FirebaseUser) => {
    const [profile, billing] = await Promise.all([
      getUserProfile(fb.uid),
      fetchBillingStatus(fb.uid),
    ]);
    const displayName = profile?.displayName ?? fb.displayName ?? undefined;
    const name = displayName ?? (profile?.firstName && profile?.lastName
      ? `${profile.firstName} ${profile.lastName}`.trim()
      : undefined);
    const fbParts = fb.displayName?.split(" ") ?? [];
    setState({
      user: {
        ...mapFirebaseUser(fb),
        name: name ?? displayName,
        firstName: profile?.firstName ?? fbParts[0],
        lastName: profile?.lastName ?? (fbParts.slice(1).join(" ") || undefined),
        billing: billing ?? undefined,
      },
      profile,
      loading: false,
    });
  };

  const refreshUser = async () => {
    const auth = getAuthInstance();
    const fb = auth?.currentUser;
    if (!fb) {
      setState((s) => ({ ...s, user: null, profile: null, loading: false }));
      return;
    }
    await loadUserAndProfile(fb);
  };

  useEffect(() => {
    const auth = getAuthInstance();
    if (!auth) {
      setState((s) => ({ ...s, loading: false }));
      return;
    }
    const unsubscribe = onAuthStateChanged(auth, async (fbUser) => {
      if (!fbUser) {
        setState({ user: null, profile: null, loading: false });
        return;
      }
      await ensureUserProfile(fbUser.uid, fbUser.email ?? "", fbUser.displayName ?? undefined);
      await loadUserAndProfile(fbUser);
    });
    return () => unsubscribe();
  }, []);

  const signIn = async (email: string, password: string) => {
    await signInWithEmail(email, password);
  };

  const signUp = async (email: string, password: string, displayName?: string) => {
    const user = await signUpWithEmail(email, password, displayName);
    await ensureUserProfile(user.uid, user.email ?? "", displayName ?? user.displayName ?? undefined);
  };

  const signUpWithGoogle = async () => {
    try {
      await signInWithGoogle();
    } catch {
      throw new Error("Google sign-in failed");
    }
  };

  const signOut = async () => {
    await fbLogout();
    setState({ user: null, profile: null, loading: false });
  };

  return (
    <AuthContext.Provider
      value={{
        ...state,
        signIn,
        signUp,
        signUpWithGoogle,
        signOut,
        logout: signOut,
        refreshUser,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}

export { isOnboardingCompleted };
