"use client";

import Link from "next/link";
import Image from "next/image";
import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";

// Farby z mobilnej aplikácie (src/theme.ts)
const COLORS = {
  background: "#1D376A",
  primary: "#e06737",
  card: "#f0f4f8",
  text: "#111111",
  textMuted: "#555555",
  border: "#2d4a7a",
  textOnDark: "#ffffff",
  google: "#4285F4",
  apple: "#000000",
};

export default function LoginPage() {
  const [showPassword, setShowPassword] = useState(false);

  return (
    <div
      className="min-h-screen flex flex-col items-center justify-center p-6"
      style={{ backgroundColor: COLORS.background }}
    >
      <Image
        src="/logo.png"
        alt="Staveto"
        width={160}
        height={80}
        className="mb-6"
      />
      <h1
        className="text-4xl font-bold text-center mb-6"
        style={{ color: COLORS.textOnDark }}
      >
        Prihlásenie
      </h1>

      <div className="w-full max-w-sm space-y-4">
        <div className="space-y-2">
          <Label htmlFor="email" className="sr-only">
            Email
          </Label>
          <Input
            id="email"
            type="email"
            placeholder="email@example.com"
            className="h-12 rounded-2xl border-2 px-4 text-base"
            style={{
              backgroundColor: COLORS.card,
              borderColor: COLORS.border,
              color: COLORS.text,
            }}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="password" className="sr-only">
            Heslo
          </Label>
          <div className="relative">
            <Input
              id="password"
              type={showPassword ? "text" : "password"}
              placeholder="Heslo"
              className="h-12 rounded-2xl border-2 px-4 pr-12 text-base"
              style={{
                backgroundColor: COLORS.card,
                borderColor: COLORS.border,
                color: COLORS.text,
              }}
            />
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-700"
            >
              {showPassword ? (
                <svg className="size-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
                </svg>
              ) : (
                <svg className="size-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                </svg>
              )}
            </button>
          </div>
        </div>

        <div className="text-right">
          <Link
            href="/forgot-password"
            className="text-sm font-medium"
            style={{ color: COLORS.primary }}
          >
            Zabudnuté heslo?
          </Link>
        </div>

        <Link href="/" className="block">
          <Button
            type="button"
            className="w-full h-12 rounded-2xl text-base font-semibold"
            style={{ backgroundColor: COLORS.primary, color: COLORS.textOnDark }}
          >
            Prihlásiť sa
          </Button>
        </Link>

        <Button
          type="button"
          className="w-full h-12 rounded-2xl text-base font-semibold flex items-center justify-center gap-2"
          style={{ backgroundColor: COLORS.google, color: COLORS.textOnDark }}
        >
          <svg className="size-5" viewBox="0 0 24 24">
            <path fill="currentColor" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
            <path fill="currentColor" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
            <path fill="currentColor" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
            <path fill="currentColor" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
          </svg>
          Prihlásiť sa cez Google
        </Button>

        <Button
          type="button"
          className="w-full h-12 rounded-2xl text-base font-semibold flex items-center justify-center gap-2"
          style={{ backgroundColor: COLORS.apple, color: COLORS.textOnDark }}
        >
          <svg className="size-5" fill="currentColor" viewBox="0 0 24 24">
            <path d="M17.05 20.28c-.98.95-2.05.8-3.08.35-1.09-.46-2.09-.48-3.24 0-1.44.62-2.2.44-3.06-.35C2.79 15.25 3.51 7.59 9.05 7.31c1.35.07 2.29.74 3.08.8 1.18-.24 2.31-.93 3.57-.84 1.51.12 2.65.72 3.4 1.8-3.12 1.87-2.38 5.98.48 7.13-.57 1.5-1.31 2.99-2.54 4.09l.01-.01zM12.03 7.25c-.15-2.23 1.66-4.07 3.74-4.25.29 2.58-2.34 4.5-3.74 4.25z" />
          </svg>
          Prihlásiť sa cez Apple
        </Button>

        <div className="pt-4 text-center">
          <Link
            href="/register"
            className="text-sm font-medium"
            style={{ color: COLORS.primary }}
          >
            Nemáte účet?
          </Link>
        </div>
      </div>
    </div>
  );
}
