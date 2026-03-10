import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
} from "@nestjs/common";
import { eq, desc, count } from "drizzle-orm";
import { InjectDrizzle, type DrizzleDB } from "@superbuilder/drizzle";
import { files } from "@superbuilder/drizzle";
import { buildPaginatedResult } from "../../../shared/utils/offset-pagination";
import { SupabaseStorageService } from "./supabase-storage.service";
import type {
  FileRecord,
  UploadInput,
  PaginationInput,
  PaginatedFiles,
  SignedUploadUrlResponse,
  FileConstraints,
} from "../types";
import { randomUUID } from "crypto";

const FILE_CONSTRAINTS: FileConstraints = {
  maxSize: 50 * 1024 * 1024, // 50MB
  allowedMimeTypes: [
    "image/jpeg",
    "image/png",
    "image/gif",
    "image/webp",
    "image/svg+xml",
    "application/pdf",
    "application/msword",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    "application/vnd.ms-excel",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "text/plain",
    "text/csv",
    "text/markdown",
  ],
};

@Injectable()
export class FileService {
  constructor(
    @InjectDrizzle() private readonly db: DrizzleDB,
    private readonly storageService: SupabaseStorageService
  ) {}

  /**
   * 파일 업로드
   */
  async upload(input: UploadInput, userId: string): Promise<FileRecord> {
    // 검증
    this.validateFile(input.mimeType, input.size);

    const bucket = input.bucket ?? "files";
    const folder = input.folder ?? userId;
    const originalName = input.originalName ?? input.filename ?? "unknown";
    const ext = this.getExtension(originalName);
    const fileName = `${randomUUID()}${ext}`;
    const path = `${folder}/${fileName}`;

    // Storage 업로드
    await this.storageService.upload(bucket, path, input.file, {
      contentType: input.mimeType,
    });

    // Public URL 또는 일반 URL 결정
    const isPublicBucket = bucket === "public-files";
    const publicUrl = isPublicBucket
      ? this.storageService.getPublicUrl(bucket, path)
      : null;
    const url = publicUrl ?? `storage://${bucket}/${path}`;

    // DB 저장
    const [created] = await this.db
      .insert(files)
      .values({
        name: fileName,
        originalName,
        mimeType: input.mimeType,
        size: input.size,
        url,
        bucket,
        path,
        publicUrl,
        uploadedById: userId,
      })
      .returning();

    return created as FileRecord;
  }

  /**
   * ID로 파일 조회
   */
  async findById(id: string): Promise<FileRecord | null> {
    const [result] = await this.db
      .select()
      .from(files)
      .where(eq(files.id, id))
      .limit(1);

    return (result as FileRecord) ?? null;
  }

  /**
   * 사용자별 파일 목록 조회
   */
  async findByUser(
    userId: string,
    options?: PaginationInput
  ): Promise<PaginatedFiles> {
    const page = options?.page ?? 1;
    const limit = options?.limit ?? 20;
    const offset = (page - 1) * limit;

    const [data, totalResult] = await Promise.all([
      this.db
        .select()
        .from(files)
        .where(eq(files.uploadedById, userId))
        .orderBy(desc(files.createdAt))
        .limit(limit)
        .offset(offset),
      this.db
        .select({ count: count() })
        .from(files)
        .where(eq(files.uploadedById, userId)),
    ]);

    const total = totalResult[0]?.count ?? 0;

    return buildPaginatedResult(data as FileRecord[], total, page, limit);
  }

  /**
   * 전체 파일 목록 조회 (Admin)
   */
  async findAll(options?: PaginationInput): Promise<PaginatedFiles> {
    const page = options?.page ?? 1;
    const limit = options?.limit ?? 20;
    const offset = (page - 1) * limit;

    const [data, totalResult] = await Promise.all([
      this.db
        .select()
        .from(files)
        .orderBy(desc(files.createdAt))
        .limit(limit)
        .offset(offset),
      this.db.select({ count: count() }).from(files),
    ]);

    const total = totalResult[0]?.count ?? 0;

    return buildPaginatedResult(data as FileRecord[], total, page, limit);
  }

  /**
   * 파일 삭제
   */
  async delete(id: string, userId: string): Promise<void> {
    const file = await this.findById(id);
    if (!file) {
      throw new NotFoundException(`File with id ${id} not found`);
    }

    // 권한 확인 (자신의 파일만 삭제 가능)
    if (file.uploadedById !== userId) {
      throw new ForbiddenException("You can only delete your own files");
    }

    // Storage에서 삭제
    await this.storageService.delete(file.bucket, [file.path]);

    // DB에서 삭제
    await this.db.delete(files).where(eq(files.id, id));
  }

  /**
   * Admin용 파일 삭제 (권한 검사 없음)
   */
  async adminDelete(id: string): Promise<void> {
    const file = await this.findById(id);
    if (!file) {
      throw new NotFoundException(`File with id ${id} not found`);
    }

    await this.storageService.delete(file.bucket, [file.path]);
    await this.db.delete(files).where(eq(files.id, id));
  }

  /**
   * Signed URL 발급 (다운로드용)
   */
  async getSignedUrl(id: string, userId: string): Promise<string> {
    const file = await this.findById(id);
    if (!file) {
      throw new NotFoundException(`File with id ${id} not found`);
    }

    // Public URL이 있으면 그대로 반환
    if (file.publicUrl) {
      return file.publicUrl;
    }

    // 권한 확인
    if (file.uploadedById !== userId) {
      throw new ForbiddenException("You can only access your own files");
    }

    return this.storageService.createSignedUrl(file.bucket, file.path);
  }

  /**
   * Client Direct Upload용 Signed Upload URL 발급
   */
  async createSignedUploadUrl(
    bucket: string,
    filename: string,
    userId: string
  ): Promise<SignedUploadUrlResponse> {
    const ext = this.getExtension(filename);
    const fileName = `${randomUUID()}${ext}`;
    const path = `${userId}/${fileName}`;

    return this.storageService.createSignedUploadUrl(bucket, path);
  }

  /**
   * 파일 검증
   */
  private validateFile(mimeType: string, size: number): void {
    if (size > FILE_CONSTRAINTS.maxSize) {
      throw new BadRequestException(
        `File size exceeds ${FILE_CONSTRAINTS.maxSize / 1024 / 1024}MB limit`
      );
    }

    if (!FILE_CONSTRAINTS.allowedMimeTypes.includes(mimeType)) {
      throw new BadRequestException(`File type ${mimeType} is not allowed`);
    }
  }

  /**
   * 파일명에서 확장자 추출
   */
  private getExtension(filename: string): string {
    const lastDot = filename.lastIndexOf(".");
    return lastDot !== -1 ? filename.slice(lastDot) : "";
  }
}
