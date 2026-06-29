// Server-only — generates short-lived signed URLs for private documents.

import { adminStorage } from "@/lib/firebase-admin";

const DEFAULT_TTL_SECONDS = 60 * 60; // 1 hour

// Mint a signed download URL for a private document stored at `path`.
// Returns the bucket's public URL when the Storage emulator is active
// (the emulator serves all objects without signing).
export async function getSignedDownloadUrl(
  path: string,
  ttlSeconds = DEFAULT_TTL_SECONDS
): Promise<string> {
  if (!path) return "";

  const file = adminStorage.bucket().file(path);

  // Emulator path: no real signing, just construct the public URL
  if (process.env.FIREBASE_STORAGE_EMULATOR_HOST) {
    const host = process.env.FIREBASE_STORAGE_EMULATOR_HOST;
    const bucket = adminStorage.bucket().name;
    return `http://${host}/v0/b/${bucket}/o/${encodeURIComponent(path)}?alt=media`;
  }

  const [url] = await file.getSignedUrl({
    action: "read",
    expires: Date.now() + ttlSeconds * 1000,
  });
  return url;
}
