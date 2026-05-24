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

// Firebase doesn't expose `_isEmulator` on its public types, but the field
// is set internally after connect{Auth,Storage}Emulator. A local view type
// reads/writes it without escape hatches; trades 3 ts-expect-error
// directives for one well-named view.
type EmulatorAware = { _isEmulator?: boolean };

if (
  process.env.NEXT_PUBLIC_USE_FIREBASE_EMULATOR === "true" &&
  typeof window !== "undefined"
) {
  if (!(auth as EmulatorAware)._isEmulator) {
    connectAuthEmulator(auth, "http://localhost:9099", { disableWarnings: true });
  }
  if (!(storage as EmulatorAware)._isEmulator) {
    connectStorageEmulator(storage, "localhost", 9199);
    (storage as EmulatorAware)._isEmulator = true;
  }
}

export { app, auth, storage };
