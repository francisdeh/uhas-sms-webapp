import { initializeApp, getApps, getApp } from "firebase/app";
import { getAuth, connectAuthEmulator } from "firebase/auth";
import { getStorage, connectStorageEmulator } from "firebase/storage";

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
};

const app = getApps().length ? getApp() : initializeApp(firebaseConfig);
const auth = getAuth(app);
const storage = getStorage(app);

if (
  process.env.NEXT_PUBLIC_USE_FIREBASE_EMULATOR === "true" &&
  typeof window !== "undefined"
) {
  // @ts-expect-error - emulator flag not on auth type
  if (!auth._isEmulator) {
    connectAuthEmulator(auth, "http://localhost:9099", { disableWarnings: true });
  }
  // @ts-expect-error - emulator flag not on storage type
  if (!storage._isEmulator) {
    connectStorageEmulator(storage, "localhost", 9199);
    // @ts-expect-error
    storage._isEmulator = true;
  }
}

export { app, auth, storage };
