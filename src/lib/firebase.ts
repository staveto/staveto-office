import { initializeApp, getApps, type FirebaseApp } from "firebase/app";
import { getAuth, GoogleAuthProvider, signInWithPopup, signOut, onAuthStateChanged, type User } from "firebase/auth";

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY ?? "AIzaSyAmvsgGQRE3x9W4vaREZo3rcbRO_Qy0eYI",
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN ?? "staveto-mvp-5f251.firebaseapp.com",
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID ?? "staveto-mvp-5f251",
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET ?? "staveto-mvp-5f251.firebasestorage.app",
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID ?? "255961550157",
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
};

function getApp(): FirebaseApp | null {
  if (getApps().length > 0) {
    return getApps()[0] as FirebaseApp;
  }
  if (!firebaseConfig.apiKey || !firebaseConfig.appId) {
    return null;
  }
  return initializeApp(firebaseConfig);
}

export function getAuthInstance() {
  const app = getApp();
  return app ? getAuth(app) : null;
}

export async function signInWithGoogle(): Promise<User> {
  const auth = getAuthInstance();
  if (!auth) {
    throw new Error("Firebase nie je nakonfigurovaný. Pridajte NEXT_PUBLIC_FIREBASE_* do .env.local");
  }
  const provider = new GoogleAuthProvider();
  const result = await signInWithPopup(auth, provider);
  return result.user;
}

export async function logout(): Promise<void> {
  const auth = getAuthInstance();
  if (auth) {
    await signOut(auth);
  }
}

export { onAuthStateChanged };
export type { User };
