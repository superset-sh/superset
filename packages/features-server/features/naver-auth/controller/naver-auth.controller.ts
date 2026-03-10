/**
 * Naver Auth Feature - Controller
 *
 * Naver OAuth 2.0 인증 플로우를 위한 REST Controller.
 * - GET /api/auth/naver/authorize : 네이버 로그인 페이지로 리다이렉트
 * - GET /api/auth/naver/callback  : OAuth 콜백 처리 후 프론트엔드로 리다이렉트
 */

import { Controller, Get, Query, Res } from "@nestjs/common";
import {
  ApiTags,
  ApiOperation,
  ApiQuery,
  ApiResponse,
} from "@nestjs/swagger";
import type { FastifyReply } from "fastify";
import { NaverAuthService } from "../service/naver-auth.service";

@ApiTags("Naver Auth")
@Controller("auth/naver")
export class NaverAuthController {
  constructor(private readonly naverAuthService: NaverAuthService) {}

  @Get("authorize")
  @ApiOperation({ summary: "네이버 OAuth 인증 시작" })
  @ApiQuery({
    name: "redirect_to",
    required: true,
    description: "로그인 완료 후 리다이렉트할 프론트엔드 URL",
    example: "http://localhost:3000",
  })
  @ApiResponse({ status: 302, description: "네이버 로그인 페이지로 리다이렉트" })
  authorize(
    @Query("redirect_to") redirectTo: string,
    @Res() reply: FastifyReply,
  ) {
    const url = this.naverAuthService.getAuthorizationUrl(redirectTo);
    void reply.status(302).redirect(url);
  }

  @Get("callback")
  @ApiOperation({ summary: "네이버 OAuth 콜백 처리" })
  @ApiQuery({
    name: "code",
    required: true,
    description: "네이버에서 전달받은 authorization code",
  })
  @ApiQuery({
    name: "state",
    required: true,
    description: "CSRF 방지 및 redirect_to 정보를 담은 state 파라미터",
  })
  @ApiResponse({ status: 302, description: "Supabase verify URL로 리다이렉트 (세션 생성)" })
  @ApiResponse({ status: 401, description: "인증 실패" })
  @ApiResponse({ status: 500, description: "서버 오류" })
  async callback(
    @Query("code") code: string,
    @Query("state") state: string,
    @Res() reply: FastifyReply,
  ) {
    const { redirectUrl } = await this.naverAuthService.handleCallback(code, state);
    void reply.status(302).redirect(redirectUrl);
  }
}
