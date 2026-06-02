import { initializeApp, getApps, type FirebaseApp } from "firebase/app";
import {
  getAuth,
  GoogleAuthProvider,
  signInWithPopup,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
  setPersistence,
  browserLocalPersistence,
  updateProfile,
  type User,
} from "firebase/auth";
import {
  getFirestore,
  doc,
  getDoc,
  setDoc,
  addDoc,
  updateDoc,
  deleteDoc,
  collection,
  query,
  where,
  getDocs,
  orderBy,
  limit,
  serverTimestamp,
  Timestamp,
} from "firebase/firestore";
import { getFunctions, httpsCallable } from "firebase/functions";
import {
  getStorage,
  ref,
  uploadBytes,
  getDownloadURL,
  type FirebaseStorage,
} from "firebase/storage";

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY ?? "",
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN ?? "",
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID ?? "",
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET ?? "",
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID ?? "",
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID ?? "",
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

let _auth: ReturnType<typeof getAuth> | null = null;

export function getAuthInstance() {
  if (_auth) return _auth;
  const app = getApp();
  if (!app) return null;
  _auth = getAuth(app);
  setPersistence(_auth, browserLocalPersistence).catch(() => {});
  return _auth;
}

export function getFirestoreInstance() {
  const app = getApp();
  return app ? getFirestore(app) : null;
}

export function getStorageInstance(): FirebaseStorage | null {
  const app = getApp();
  return app ? getStorage(app) : null;
}

export { ref, uploadBytes, getDownloadURL };

export const auth = { get: getAuthInstance };
export const db = { get: getFirestoreInstance };

export async function signInWithEmail(email: string, password: string): Promise<User> {
  const a = getAuthInstance();
  if (!a) {
    throw new Error("Firebase is not configured. Add NEXT_PUBLIC_FIREBASE_* to .env.local");
  }
  const result = await signInWithEmailAndPassword(a, email.trim().toLowerCase(), password);
  return result.user;
}

export async function signUpWithEmail(
  email: string,
  password: string,
  displayName?: string
): Promise<User> {
  const a = getAuthInstance();
  if (!a) {
    throw new Error("Firebase is not configured. Add NEXT_PUBLIC_FIREBASE_* to .env.local");
  }
  const result = await createUserWithEmailAndPassword(a, email.trim().toLowerCase(), password);
  const user = result.user;
  if (displayName?.trim()) {
    await updateProfile(user, { displayName: displayName.trim() });
  }
  return user;
}

export async function signInWithGoogle(): Promise<User> {
  const a = getAuthInstance();
  if (!a) {
    throw new Error("Firebase is not configured. Add NEXT_PUBLIC_FIREBASE_* to .env.local");
  }
  const provider = new GoogleAuthProvider();
  const result = await signInWithPopup(a, provider);
  return result.user;
}

export async function logout(): Promise<void> {
  const a = getAuthInstance();
  if (a) {
    await signOut(a);
  }
}

const REGION = "europe-west1";

export function getCallable<T = unknown, R = unknown>(name: string) {
  return async (data: T): Promise<{ data: R }> => {
    const app = getApp();
    if (!app) throw new Error("Firebase is not configured");
    const functions = getFunctions(app, REGION);
    const fn = httpsCallable<T, R>(functions, name);
    const result = await fn(data);
    return result as { data: R };
  };
}

export { onAuthStateChanged, doc, getDoc, setDoc, addDoc, updateDoc, deleteDoc, collection, query, where, getDocs, orderBy, limit, serverTimestamp, Timestamp };
export type { User };
