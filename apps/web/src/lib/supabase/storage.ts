// Browser-only — direct uploads to Supabase Storage.
//
// Two buckets, configured in supabase/config.toml:
//   - `photos`    (public)  → student / staff / school logos rendered in <img>
//   - `documents` (private) → lesson plans, schemes, assignments — read via
//                             server-minted signed URLs (lib/storage-admin.ts)

import { createClient as createSupabaseClient } from "@/lib/supabase/client";

export type UploadProgress = {
  loaded: number;
  total: number;
  pct: number;
};

export type UploadResult = {
  /** Bucket-relative path. Store this in DB. */
  path: string;
  /** Bucket name. */
  bucket: "photos" | "documents";
  /** Public URL — non-empty for `photos`, empty for `documents`. */
  publicUrl: string;
};

export type UploadKind =
  | "students/photo"
  | "staff/photo"
  | "school/logo"
  | "lesson-plans/file"
  | "schemes/file"
  | "schemes/resource"
  | "assignments/file"
  | "fees/receipt"
  | "students/document"
  | "staff/document"
  | "leave/document";

function safeFileName(name: string): string {
  return name
    .replace(/[^a-zA-Z0-9._-]+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "");
}

// Returns the [bucket, path] pair for a given upload kind. Photos go to
// the public bucket; documents to private.
export function buildStoragePath(
  kind: UploadKind,
  ownerId: string,
  file: File,
): { bucket: "photos" | "documents"; path: string } {
  const ext = (file.name.split(".").pop() ?? "bin").toLowerCase();
  const ts = Date.now();
  switch (kind) {
    case "students/photo":
      return { bucket: "photos", path: `students/${ownerId}-${ts}.${ext}` };
    case "staff/photo":
      return { bucket: "photos", path: `staff/${ownerId}-${ts}.${ext}` };
    case "school/logo":
      return { bucket: "photos", path: `school/${ownerId}-logo-${ts}.${ext}` };
    case "lesson-plans/file":
      return {
        bucket: "documents",
        path: `lesson-plans/${ownerId}/${ts}-${safeFileName(file.name)}`,
      };
    case "schemes/file":
      return {
        bucket: "documents",
        path: `schemes/${ownerId}/${ts}-${safeFileName(file.name)}`,
      };
    case "schemes/resource":
      return {
        bucket: "documents",
        path: `schemes/resources/${ownerId}/${ts}-${safeFileName(file.name)}`,
      };
    case "assignments/file":
      return {
        bucket: "documents",
        path: `assignments/${ownerId}/${ts}-${safeFileName(file.name)}`,
      };
    case "fees/receipt":
      return {
        bucket: "documents",
        path: `fees/receipts/${ownerId}/${ts}-${safeFileName(file.name)}`,
      };
    case "students/document":
      return {
        bucket: "documents",
        path: `students/documents/${ownerId}/${ts}-${safeFileName(file.name)}`,
      };
    case "staff/document":
      return {
        bucket: "documents",
        path: `staff/documents/${ownerId}/${ts}-${safeFileName(file.name)}`,
      };
    case "leave/document":
      return {
        bucket: "documents",
        path: `leave/documents/${ownerId}/${ts}-${safeFileName(file.name)}`,
      };
  }
}

export type UploadHandle = {
  promise: Promise<UploadResult>;
  /**
   * Cancel the upload. Supabase JS doesn't expose true mid-upload cancel
   * (the SDK uses fetch under the hood, no AbortController hook exposed
   * in v2). For now we resolve to a noop; callers shouldn't depend on
   * cancel terminating the network request. Tracked as a TODO.
   */
  cancel: () => void;
};

export function uploadFile(
  bucket: "photos" | "documents",
  path: string,
  file: File,
  onProgress?: (p: UploadProgress) => void,
): UploadHandle {
  const supabase = createSupabaseClient();

  // Synthetic "start" progress so the UI shows something immediately —
  // Supabase JS v2 doesn't surface upload-chunk events.
  onProgress?.({ loaded: 0, total: file.size, pct: 0 });

  const promise = (async (): Promise<UploadResult> => {
    const { error } = await supabase.storage.from(bucket).upload(path, file, {
      cacheControl: "3600",
      upsert: false,
      contentType: file.type || undefined,
    });
    if (error) throw new Error(error.message);
    onProgress?.({ loaded: file.size, total: file.size, pct: 1 });

    let publicUrl = "";
    if (bucket === "photos") {
      const { data } = supabase.storage.from(bucket).getPublicUrl(path);
      publicUrl = data.publicUrl;
    }
    return { path, bucket, publicUrl };
  })();

  return { promise, cancel: () => {} };
}
