/**
 * Supabase Storage Provider
 *
 * StorageProvider 인터페이스의 Supabase Storage 구현체.
 * S3-compatible 스토리지로 마이그레이션 시 이 파일만 교체하면 됨.
 */

import { Injectable, InternalServerErrorException, BadGatewayException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { createClient, SupabaseClient } from "@supabase/supabase-js";
import { randomUUID } from "crypto";
import type { StorageProvider, UploadOptions, StorageUploadResult, SignedUploadUrlResult } from "./storage-provider.interface";

@Injectable()
export class SupabaseStorageService implements StorageProvider {
  private supabase: SupabaseClient;

  constructor(private readonly configService: ConfigService) {
    const supabaseUrl = this.configService.get<string>("SUPABASE_URL");
    const supabaseSecretKey = this.configService.get<string>("SUPABASE_SECRET_KEY");

    if (!supabaseUrl || !supabaseSecretKey) {
      throw new InternalServerErrorException("Supabase 환경변수가 설정되지 않았습니다 (SUPABASE_URL, SUPABASE_SECRET_KEY)");
    }

    this.supabase = createClient(supabaseUrl, supabaseSecretKey);
  }

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

  async delete(bucket: string, paths: string[]): Promise<void> {
    const { error } = await this.supabase.storage.from(bucket).remove(paths);

    if (error) {
      throw new BadGatewayException(`스토리지 삭제 오류: ${error.message}`);
    }
  }

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

  async createSignedUploadUrl(
    bucket: string,
    path: string
  ): Promise<SignedUploadUrlResult> {
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
    };
  }

  getPublicUrl(bucket: string, path: string): string {
    const { data } = this.supabase.storage.from(bucket).getPublicUrl(path);
    return data.publicUrl;
  }
}
