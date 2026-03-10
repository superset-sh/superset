/**
 * Naver Auth Feature - NestJS Module
 *
 * Naver OAuth 2.0 서버사이드 인증 처리 모듈.
 * Supabase Admin API를 통해 사용자 생성/세션 관리.
 */

import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { NaverAuthController } from "./controller/naver-auth.controller";
import { NaverAuthService } from "./service/naver-auth.service";

@Module({
  imports: [ConfigModule],
  controllers: [NaverAuthController],
  providers: [NaverAuthService],
  exports: [NaverAuthService],
})
export class NaverAuthModule {}
