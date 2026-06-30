import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { AuthProvider } from "@/context/AuthContext";
import { I18nProvider } from "@/i18n/I18nContext";
import { UserPreferredLocaleSync } from "@/i18n/UserPreferredLocaleSync";
import { ThemeProvider } from "@/providers/ThemeProvider";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Staveto Office",
  description: "Manage estimates and quotes for Staveto",
  icons: {
    icon: [
      { url: "/favicon.png?v=2", type: "image/png", sizes: "192x192" },
      { url: "/favicon.png?v=2", type: "image/png", sizes: "32x32" },
    ],
    shortcut: "/favicon.png?v=2",
    apple: [{ url: "/favicon.png?v=2", type: "image/png" }],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="sk" suppressHydrationWarning>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        <ThemeProvider>
          <AuthProvider>
            <I18nProvider>
              <UserPreferredLocaleSync />
              {children}
            </I18nProvider>
          </AuthProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
