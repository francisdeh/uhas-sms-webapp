"use server";

import { getSignedDownloadUrl } from "@/lib/storage-admin";
import { getSessionUser } from "@/features/auth/queries/get-session-user";

// Client components call this on download click to mint a fresh 1-hour signed
// URL. Requires an authenticated session — silently returns "" otherwise.
export async function signDocumentUrlAction(path: string): Promise<string> {
  if (!path) return "";
  const session = await getSessionUser();
  if (!session) return "";
  return getSignedDownloadUrl(path);
}
