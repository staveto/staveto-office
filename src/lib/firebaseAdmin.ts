import { existsSync } from "fs";
import { homedir } from "os";
import { join } from "path";
import {
  initializeApp,
  getApps,
  cert,
  applicationDefault,
  type App,
} from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { getAuth } from "firebase-admin/auth";
import { getStorage } from "firebase-admin/storage";
import { STAVETO_FIREBASE_PROJECT_ID } from "@/lib/gmail/config";

let adminApp: App | null = null;

function parseServiceAccount(): Record<string, string> | null {
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT_JSON?.trim();
  if (!raw) return null;
  try {
    return JSON.parse(raw) as Record<string, string>;
  } catch {
    return null;
  }
}

function applicationDefaultCredentialsPath(): string | null {
  if (process.env.GOOGLE_APPLICATION_CREDENTIALS?.trim()) {
    return process.env.GOOGLE_APPLICATION_CREDENTIALS.trim();
  }
  const win = process.env.APPDATA
    ? join(process.env.APPDATA, "gcloud", "application_default_credentials.json")
    : null;
  if (win && existsSync(win)) return win;
  const unix = join(homedir(), ".config", "gcloud", "application_default_credentials.json");
  if (existsSync(unix)) return unix;
  return null;
}

function resolveProjectId(): string {
  return (
    process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID?.trim() ||
    process.env.FIREBASE_PROJECT_ID?.trim() ||
    STAVETO_FIREBASE_PROJECT_ID
  );
}

function resolveStorageBucket(projectId: string): string {
  return (
    process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET?.trim() ||
    process.env.FIREBASE_STORAGE_BUCKET?.trim() ||
    `${projectId}.appspot.com`
  );
}

export function getAdminApp(): App | null {
  if (adminApp) return adminApp;
  const existing = getApps();
  if (existing.length > 0) {
    adminApp = existing[0]!;
    return adminApp;
  }

  const projectId = resolveProjectId();
  const storageBucket = resolveStorageBucket(projectId);
  const serviceAccount = parseServiceAccount();
  const hasAdc = !!applicationDefaultCredentialsPath();

  const attempts: Array<() => App> = [];

  if (serviceAccount) {
    attempts.push(() =>
      initializeApp({
        credential: cert(serviceAccount as Parameters<typeof cert>[0]),
        projectId,
        storageBucket,
      })
    );
  }

  if (hasAdc) {
    attempts.push(() =>
      initializeApp({
        credential: applicationDefault(),
        projectId,
        storageBucket,
      })
    );
  }

  for (const attempt of attempts) {
    try {
      adminApp = attempt();
      return adminApp;
    } catch {
      /* try next */
    }
  }

  return null;
}

export function getAdminDb() {
  const app = getAdminApp();
  return app ? getFirestore(app) : null;
}

export function getAdminAuth() {
  const app = getAdminApp();
  return app ? getAuth(app) : null;
}

export function getAdminStorage() {
  const app = getAdminApp();
  return app ? getStorage(app) : null;
}

/** True when service-account JSON or gcloud application-default credentials are available. */
export function isAdminConfigured(): boolean {
  return !!parseServiceAccount() || !!applicationDefaultCredentialsPath();
}
