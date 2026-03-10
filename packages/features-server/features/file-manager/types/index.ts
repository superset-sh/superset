import type { File } from "@superbuilder/drizzle";
import type { PaginationInput, PaginatedResult } from "../../../shared/types/pagination";

export type FileRecord = File;

/** buildPaginatedResult 반환값 사용 */
export type PaginatedFiles = PaginatedResult<FileRecord>;

/** PaginationInput re-export */
export type { PaginationInput };

export interface UploadInput {
  file: Buffer | any;
  filename?: string;
  originalName?: string;
  mimeType: string;
  size: number;
  bucket?: string;
  folder?: string;
}

export interface SignedUploadUrlResponse {
  uploadUrl?: string;
  signedUrl?: string;
  path?: string;
  token?: string;
  fileId: string;
  publicUrl?: string;
}

export interface FileConstraints {
  maxSize: number;
  allowedMimeTypes: string[];
}

export interface StorageUploadResult {
  id?: string;
  path: string;
  publicUrl?: string;
}
