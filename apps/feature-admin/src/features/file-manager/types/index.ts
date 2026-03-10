/**
 * File Manager Client Types
 *
 * tRPC는 JSON 직렬화를 사용하므로 Date → string 변환됨
 * 서버 타입의 Date 필드를 string으로 변환한 클라이언트 타입 정의
 */

/** 파일 레코드 (JSON 직렬화 후 클라이언트 타입) */
export interface FileRecord {
  id: string;
  name: string;
  originalName: string;
  mimeType: string;
  size: number;
  url: string;
  bucket: string;
  path: string;
  publicUrl: string | null;
  uploadedById: string;
  createdAt: string | null;
  updatedAt: string | null;
}

/** 페이지네이션 파일 목록 */
export interface PaginatedFiles {
  data: FileRecord[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

/** 업로드 옵션 (REST API용) */
export interface UploadOptions {
  bucket?: "files" | "public-files";
  folder?: string;
}
