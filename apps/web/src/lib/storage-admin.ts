// Server-only — generates short-lived signed URLs for private documents.
//
// Public photos don't need this: callers store the publicUrl returned by
// uploadFile and embed it directly. Private documents (lesson plans,
// schemes, assignments) live in the `documents` bucket which has no
// public access policy — they're only fetchable via a signed URL.

import { getSupabaseAdmin } from "@/lib/supabase/admin";

const DEFAULT_TTL_SECONDS = 60 * 60; // 1 hour

/**
 * Mint a signed download URL for an object in the `documents` bucket.
 * The path is bucket-relative (no leading `documents/`).
 *
 * Returns empty string if the path is empty. Throws on Supabase errors;
 * callers should wrap if they want graceful degradation.
 */
export async function getSignedDownloadUrl(
  path: string,
  ttlSeconds = DEFAULT_TTL_SECONDS,
): Promise<string> {
  if (!path) return "";
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase.storage
    .from("documents")
    .createSignedUrl(path, ttlSeconds);
  if (error) throw new Error(error.message);
  return data.signedUrl;
}
