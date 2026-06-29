// Browser-only — direct uploads to Firebase Storage using the Web SDK.

import {
  ref,
  uploadBytesResumable,
  getDownloadURL,
  type UploadTask,
} from "firebase/storage";
import { storage } from "@/lib/firebase";

export type UploadProgress = {
  loaded: number;
  total: number;
  pct: number;
};

export type UploadResult = {
  path: string;        // storage path (e.g. "documents/lesson-plans/lp-123/file.pdf")
  publicUrl: string;   // download URL (works for public photos; for private docs callers ignore this and store `path` instead)
};

// Sanitise a filename for use as a path segment.
function safeFileName(name: string): string {
  return name
    .replace(/[^a-zA-Z0-9._-]+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "");
}

// Build a Storage path from kind + ownerId + the file.
export function buildStoragePath(
  kind:
    | "students/photo"
    | "staff/photo"
    | "school/logo"
    | "lesson-plans/file"
    | "schemes/file"
    | "assignments/file",
  ownerId: string,
  file: File
): string {
  const ext = (file.name.split(".").pop() ?? "bin").toLowerCase();
  const ts = Date.now();
  switch (kind) {
    case "students/photo":
      return `photos/students/${ownerId}-${ts}.${ext}`;
    case "staff/photo":
      return `photos/staff/${ownerId}-${ts}.${ext}`;
    case "school/logo":
      return `photos/school/${ownerId}-logo-${ts}.${ext}`;
    case "lesson-plans/file":
      return `documents/lesson-plans/${ownerId}/${ts}-${safeFileName(file.name)}`;
    case "schemes/file":
      return `documents/schemes/${ownerId}/${ts}-${safeFileName(file.name)}`;
    case "assignments/file":
      return `documents/assignments/${ownerId}/${ts}-${safeFileName(file.name)}`;
  }
}

export function uploadFile(
  path: string,
  file: File,
  onProgress?: (p: UploadProgress) => void
): { promise: Promise<UploadResult>; task: UploadTask } {
  const storageRef = ref(storage, path);
  const task = uploadBytesResumable(storageRef, file, { contentType: file.type });

  const promise = new Promise<UploadResult>((resolve, reject) => {
    task.on(
      "state_changed",
      (snap) => {
        if (onProgress) {
          const pct = snap.totalBytes > 0 ? snap.bytesTransferred / snap.totalBytes : 0;
          onProgress({ loaded: snap.bytesTransferred, total: snap.totalBytes, pct });
        }
      },
      (err) => reject(err),
      async () => {
        try {
          const publicUrl = await getDownloadURL(task.snapshot.ref);
          resolve({ path, publicUrl });
        } catch (err) {
          reject(err);
        }
      }
    );
  });

  return { promise, task };
}
