/**
 * 파일 업로드 유틸리티
 *
 * React 외부에서도 사용 가능한 standalone 함수
 *
 * @example
 * import { uploadFile } from "@superbuilder/widgets/file-manager";
 * const result = await uploadFile(file, { bucket: "public-files" });
 *
 * @example
 * const results = await Promise.all(
 *   files.map(file => uploadFile(file, { bucket: "files" }))
 * );
 */
import { getApiUrl, getAuthHeaders } from "./upload-config";
import type { FileRecord, UploadOptions } from "../types";

export async function uploadFile(
  file: File,
  options?: UploadOptions,
): Promise<FileRecord> {
  const formData = new FormData();
  formData.append("file", file);
  if (options?.bucket) formData.append("bucket", options.bucket);
  if (options?.folder) formData.append("folder", options.folder);

  const res = await fetch(`${getApiUrl()}/api/files/upload`, {
    method: "POST",
    headers: getAuthHeaders(),
    body: formData,
  });

  if (!res.ok) {
    const error = await res.json().catch(() => ({}));
    throw new Error(error.message ?? "파일 업로드에 실패했습니다.");
  }

  return res.json();
}
