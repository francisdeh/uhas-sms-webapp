import { initializeApp, getApps, cert, App } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getStorage } from "firebase-admin/storage";

// Point firebase-admin at the Storage emulator when the auth emulator is
// active. Both share the same dev environment flag.
if (
  process.env.FIREBASE_AUTH_EMULATOR_HOST &&
  !process.env.STORAGE_EMULATOR_HOST &&
  !process.env.FIREBASE_STORAGE_EMULATOR_HOST
) {
  process.env.FIREBASE_STORAGE_EMULATOR_HOST = "localhost:9199";
}

function getAdminApp(): App {
  if (getApps().length) return getApps()[0]!;

  const bucket =
    process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET ||
    `${process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID ?? "uhas-sms-dev"}.appspot.com`;

  // Emulator: no credentials needed — just a project ID
  if (process.env.FIREBASE_AUTH_EMULATOR_HOST) {
    return initializeApp({
      projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID ?? "uhas-sms-dev",
      storageBucket: bucket,
    });
  }

  return initializeApp({
    credential: cert({
      projectId: process.env.FIREBASE_PROJECT_ID,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, "\n"),
    }),
    storageBucket: bucket,
  });
}

export const adminAuth = getAuth(getAdminApp());
export const adminStorage = getStorage(getAdminApp());
