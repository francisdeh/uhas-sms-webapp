"use server";

import { cookies } from "next/headers";
import { getSignedDownloadUrl } from "@/lib/storage-admin";

// Client components call this on download click to mint a fresh 1-hour signed
// URL. Requires an authenticated session — silently returns "" otherwise.
export async function signDocumentUrlAction(path: string): Promise<string> {
  if (!path) return "";
  const cookieStore = await cookies();
  if (!cookieStore.get("session_uid")?.value) return "";
  return getSignedDownloadUrl(path);
}
