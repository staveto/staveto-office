"use client";

import React, { createContext, useContext, useEffect, useState } from "react";
import { getAuthInstance, onAuthStateChanged, logout as fbLogout } from "@/lib/firebase";
import { getCallable } from "@/lib/firebase";
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
  loading: boolean;
};

type AuthContextValue = AuthState & {
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
    loading: true,
  });

  const refreshUser = async () => {
    const auth = getAuthInstance();
    const fb = auth?.currentUser;
    if (!fb) {
      setState((s) => ({ ...s, user: null, loading: false }));
      return;
    }
    const billing = await fetchBillingStatus(fb.uid);
    setState({
      user: {
        ...mapFirebaseUser(fb),
        billing: billing ?? undefined,
      },
      loading: false,
    });
  };

  useEffect(() => {
    const auth = getAuthInstance();
    if (!auth) {
      setState((s) => ({ ...s, loading: false }));
      return;
    }
    const unsubscribe = onAuthStateChanged(auth, async (fbUser) => {
      if (!fbUser) {
        setState({ user: null, loading: false });
        return;
      }
      const billing = await fetchBillingStatus(fbUser.uid);
      setState({
        user: {
          ...mapFirebaseUser(fbUser),
          billing: billing ?? undefined,
        },
        loading: false,
      });
    });
    return () => unsubscribe();
  }, []);

  const logout = async () => {
    await fbLogout();
    setState({ user: null, loading: false });
  };

  return (
    <AuthContext.Provider value={{ ...state, logout, refreshUser }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
