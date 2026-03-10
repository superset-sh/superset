import { Injectable, InternalServerErrorException, BadGatewayException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { createClient, SupabaseClient } from "@supabase/supabase-js";
import { randomUUID } from "crypto";
import type { StorageUploadResult, SignedUploadUrlResponse } from "../types";

export interface UploadOptions {
  contentType: string;
  upsert?: boolean;
}

@Injectable()
export class SupabaseStorageService {
  private supabase: SupabaseClient;

  constructor(private readonly configService: ConfigService) {
    const supabaseUrl = this.configService.get<string>("SUPABASE_URL");
    const supabaseSecretKey = this.configService.get<string>("SUPABASE_SECRET_KEY");

    if (!supabaseUrl || !supabaseSecretKey) {
      throw new InternalServerErrorException("Supabase 환경변수가 설정되지 않았습니다 (SUPABASE_URL, SUPABASE_SECRET_KEY)");
    }

    this.supabase = createClient(supabaseUrl, supabaseSecretKey);
  }

  /**
   * 파일을 Supabase Storage에 업로드
   */
  async upload(
    bucket: string,
    path: string,
    file: Buffer,
    options: UploadOptions
  ): Promise<StorageUploadResult> {
    const { data, error } = await this.supabase.storage
      .from(bucket)
      .upload(path, file, {
        contentType: options.contentType,
        upsert: options.upsert ?? false,
      });

    if (error) {
      throw new BadGatewayException(`스토리지 업로드 오류: ${error.message}`);
    }

    return {
      path: data.path,
      id: data.id,
    };
  }

  /**
   * Supabase Storage에서 파일 삭제
   */
  async delete(bucket: string, paths: string[]): Promise<void> {
    const { error } = await this.supabase.storage.from(bucket).remove(paths);

    if (error) {
      throw new BadGatewayException(`스토리지 삭제 오류: ${error.message}`);
    }
  }

  /**
   * 다운로드용 Signed URL 생성
   */
  async createSignedUrl(
    bucket: string,
    path: string,
    expiresIn = 3600
  ): Promise<string> {
    const { data, error } = await this.supabase.storage
      .from(bucket)
      .createSignedUrl(path, expiresIn);

    if (error) {
      throw new BadGatewayException(`서명 URL 생성 오류: ${error.message}`);
    }

    return data.signedUrl;
  }

  /**
   * Client Direct Upload용 Signed Upload URL 생성
   */
  async createSignedUploadUrl(
    bucket: string,
    path: string
  ): Promise<SignedUploadUrlResponse> {
    const { data, error } = await this.supabase.storage
      .from(bucket)
      .createSignedUploadUrl(path);

    if (error) {
      throw new BadGatewayException(`서명 업로드 URL 생성 오류: ${error.message}`);
    }

    return {
      signedUrl: data.signedUrl,
      path: data.path,
      token: data.token,
      fileId: randomUUID(),
    };
  }

  /**
   * Public bucket의 공개 URL 반환
   */
  getPublicUrl(bucket: string, path: string): string {
    const { data } = this.supabase.storage.from(bucket).getPublicUrl(path);
    return data.publicUrl;
  }
}
