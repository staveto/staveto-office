"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import { upsertUserProfile, completeOnboarding } from "@/lib/userProfile";
import {
  getOrCreateUserOrg,
  createInvite,
  getUserOrgMemberships,
} from "@/lib/organizations";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Loader2, ChevronLeft, ChevronRight, Plus, Trash2 } from "lucide-react";

const COLORS = {
  background: "#1D376A",
  primary: "#e06737",
  textOnDark: "#ffffff",
};

const PURPOSE_OPTIONS = [
  { value: "work", label: "Work" },
  { value: "personal", label: "Personal" },
  { value: "school", label: "School" },
  { value: "nonprofits", label: "Nonprofits" },
];

const ROLE_OPTIONS = [
  { value: "craftsman", label: "Craftsman" },
  { value: "manager", label: "Manager" },
  { value: "accountant", label: "Accountant" },
  { value: "other", label: "Other" },
];

const TEAM_SIZE_OPTIONS = [
  { value: "only_me", label: "Only me" },
  { value: "2_5", label: "2–5" },
  { value: "6_10", label: "6–10" },
  { value: "11_15", label: "11–15" },
  { value: "16_25", label: "16–25" },
  { value: "26_50", label: "26–50" },
  { value: "51_100", label: "51–100" },
  { value: "101_500", label: "101–500" },
];

type InviteRow = { email: string; role: "admin" | "member" };

export default function OnboardingPage() {
  const router = useRouter();
  const { user, loading, refreshUser } = useAuth();
  const [step, setStep] = useState(1);
  const [purpose, setPurpose] = useState<string>("");
  const [role, setRole] = useState<string>("");
  const [teamSize, setTeamSize] = useState<string>("");
  const [invites, setInvites] = useState<InviteRow[]>([{ email: "", role: "member" }]);
  const [saving, setSaving] = useState(false);
  const [inviteLink, setInviteLink] = useState<string | null>(null);

  const saveStep = async (onboardingData: Partial<{ purpose: string; role: string; teamSize: string; inviteEmails: InviteRow[] }>) => {
    if (!user?.id) return;
    setSaving(true);
    try {
      await upsertUserProfile(user.id, {
        onboarding: {
          purpose: onboardingData.purpose ?? purpose,
          role: onboardingData.role ?? role,
          teamSize: onboardingData.teamSize ?? teamSize,
          inviteEmails: onboardingData.inviteEmails,
        },
      });
    } finally {
      setSaving(false);
    }
  };

  const handleNext = async () => {
    if (step === 1 && purpose) {
      await saveStep({ purpose });
      setStep(2);
    } else if (step === 2 && role) {
      await saveStep({ purpose, role });
      setStep(3);
    } else if (step === 3 && teamSize) {
      await saveStep({ purpose, role, teamSize });
      setStep(4);
    } else if (step === 4) {
      const inviteEmails = invites.filter((r) => r.email.trim()).map((r) => ({ email: r.email.trim(), role: r.role }));
      await saveStep({ purpose, role, teamSize, inviteEmails });
      if (teamSize !== "only_me" && user?.id && user?.email && inviteEmails.length > 0) {
        const orgId = await getOrCreateUserOrg(user.id, user.email);
        if (orgId) {
          let firstToken: string | null = null;
          for (const inv of inviteEmails) {
            const { token } = await createInvite(orgId, inv.email, inv.role as "admin" | "member", user.id);
            if (!firstToken) firstToken = token;
          }
          if (firstToken && typeof window !== "undefined") {
            const base = window.location.origin;
            setInviteLink(`${base}/join?token=${firstToken}`);
          }
        }
      }
      setStep(5);
    } else if (step === 5) {
      setSaving(true);
      try {
        await completeOnboarding(user!.id);
        await refreshUser();
        router.push("/app");
      } finally {
        setSaving(false);
      }
    }
  };

  const handleBack = () => {
    setStep((s) => Math.max(1, s - 1));
  };

  const addInviteRow = () => {
    setInvites((prev) => [...prev, { email: "", role: "member" }]);
  };

  const removeInviteRow = (i: number) => {
    setInvites((prev) => prev.filter((_, idx) => idx !== i));
  };

  const updateInvite = (i: number, field: keyof InviteRow, value: string) => {
    setInvites((prev) => {
      const next = [...prev];
      next[i] = { ...next[i], [field]: value };
      return next;
    });
  };

  const canProceed =
    (step === 1 && purpose) ||
    (step === 2 && role) ||
    (step === 3 && teamSize) ||
    step === 4 ||
    step === 5;

  if (loading || !user) {
    return (
      <div
        className="min-h-screen flex items-center justify-center"
        style={{ backgroundColor: COLORS.background }}
      >
        <Loader2 className="size-8 animate-spin text-white" />
      </div>
    );
  }

  return (
    <div
      className="min-h-screen flex flex-col md:flex-row"
      style={{ backgroundColor: COLORS.background }}
    >
      {/* Left: Form */}
      <div className="flex-1 flex flex-col justify-center p-6 md:p-12">
        <Card className="max-w-md w-full bg-white/95">
          <CardHeader>
            <CardTitle className="text-xl">
              {step === 1 && "What brings you here?"}
              {step === 2 && "What best describes your current role?"}
              {step === 3 && "How many people are on your team?"}
              {step === 4 && "Who else is on your team?"}
              {step === 5 && "You're all set!"}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {step === 1 && (
              <div className="flex flex-wrap gap-2">
                {PURPOSE_OPTIONS.map((opt) => (
                  <Button
                    key={opt.value}
                    type="button"
                    variant={purpose === opt.value ? "default" : "outline"}
                    size="sm"
                    onClick={() => setPurpose(opt.value)}
                    style={purpose === opt.value ? { backgroundColor: COLORS.primary } : undefined}
                  >
                    {opt.label}
                  </Button>
                ))}
              </div>
            )}
            {step === 2 && (
              <div className="flex flex-wrap gap-2">
                {ROLE_OPTIONS.map((opt) => (
                  <Button
                    key={opt.value}
                    type="button"
                    variant={role === opt.value ? "default" : "outline"}
                    size="sm"
                    onClick={() => setRole(opt.value)}
                    style={role === opt.value ? { backgroundColor: COLORS.primary } : undefined}
                  >
                    {opt.label}
                  </Button>
                ))}
              </div>
            )}
            {step === 3 && (
              <div className="flex flex-wrap gap-2">
                {TEAM_SIZE_OPTIONS.map((opt) => (
                  <Button
                    key={opt.value}
                    type="button"
                    variant={teamSize === opt.value ? "default" : "outline"}
                    size="sm"
                    onClick={() => setTeamSize(opt.value)}
                    style={teamSize === opt.value ? { backgroundColor: COLORS.primary } : undefined}
                  >
                    {opt.label}
                  </Button>
                ))}
              </div>
            )}
            {step === 4 && (
              <div className="space-y-3">
                {invites.map((row, i) => (
                  <div key={i} className="flex gap-2 items-center">
                    <Input
                      type="email"
                      placeholder="email@example.com"
                      value={row.email}
                      onChange={(e) => updateInvite(i, "email", e.target.value)}
                      className="flex-1"
                    />
                    <select
                      value={row.role}
                      onChange={(e) => updateInvite(i, "role", e.target.value)}
                      className="h-9 rounded-lg border border-input px-2 text-sm"
                    >
                      <option value="member">Member</option>
                      <option value="admin">Admin</option>
                    </select>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      onClick={() => removeInviteRow(i)}
                      disabled={invites.length <= 1}
                    >
                      <Trash2 className="size-4" />
                    </Button>
                  </div>
                ))}
                <Button type="button" variant="outline" size="sm" onClick={addInviteRow}>
                  <Plus className="size-4 mr-1" />
                  Add member
                </Button>
              </div>
            )}
            {step === 5 && (
              <div className="space-y-3">
                <p className="text-muted-foreground">
                  Welcome to Staveto. Click Finish to go to your dashboard.
                </p>
                {inviteLink && (
                  <div className="space-y-2">
                    <Label>Invite link (share with your team)</Label>
                    <div className="flex gap-2">
                      <Input readOnly value={inviteLink} className="font-mono text-sm" />
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          navigator.clipboard.writeText(inviteLink);
                        }}
                      >
                        Copy
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </CardContent>
          <CardFooter className="flex justify-between">
            <Button
              type="button"
              variant="ghost"
              onClick={handleBack}
              disabled={step <= 1 || saving}
            >
              <ChevronLeft className="size-4 mr-1" />
              Back
            </Button>
            <Button
              type="button"
              onClick={handleNext}
              disabled={!canProceed || saving}
              style={{ backgroundColor: COLORS.primary }}
            >
              {saving ? (
                <Loader2 className="size-4 animate-spin" />
              ) : step === 5 ? (
                "Finish"
              ) : (
                <>
                  Continue
                  <ChevronRight className="size-4 ml-1" />
                </>
              )}
            </Button>
          </CardFooter>
        </Card>
      </div>

      {/* Right: Illustration placeholder - hidden on small screens */}
      <div className="hidden md:flex flex-1 items-center justify-center p-12">
        <div
          className="w-full max-w-md aspect-square rounded-2xl flex items-center justify-center"
          style={{ backgroundColor: "rgba(224, 103, 55, 0.2)" }}
        >
          <svg
            className="w-1/2 h-1/2 text-white/40"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={1.5}
              d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
            />
          </svg>
        </div>
      </div>
    </div>
  );
}
