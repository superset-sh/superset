/**
 * Storage Provider Interface
 *
 * 파일 스토리지 추상화 인터페이스.
 * Supabase Storage, S3, GCS 등 다양한 구현체로 교체 가능.
 */

export interface UploadOptions {
  contentType: string;
  upsert?: boolean;
}

export interface StorageUploadResult {
  path: string;
  id?: string;
}

export interface SignedUploadUrlResult {
  signedUrl: string;
  path: string;
  token: string;
}

export const STORAGE_PROVIDER = "STORAGE_PROVIDER";

export interface StorageProvider {
  /** 파일 업로드 */
  upload(bucket: string, path: string, file: Buffer, options: UploadOptions): Promise<StorageUploadResult>;

  /** 파일 삭제 */
  delete(bucket: string, paths: string[]): Promise<void>;

  /** 다운로드용 Signed URL 생성 */
  createSignedUrl(bucket: string, path: string, expiresIn?: number): Promise<string>;

  /** Client Direct Upload용 Signed Upload URL 생성 */
  createSignedUploadUrl(bucket: string, path: string): Promise<SignedUploadUrlResult>;

  /** Public bucket의 공개 URL 반환 */
  getPublicUrl(bucket: string, path: string): string;
}
