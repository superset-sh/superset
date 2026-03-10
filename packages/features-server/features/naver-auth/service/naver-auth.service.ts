/**
 * Naver Auth Feature - Service
 *
 * Naver OAuth 2.0 서버사이드 인증 처리.
 * Supabase Admin API를 사용하여 사용자 생성/조회 및 세션 발급.
 */

import { Injectable, UnauthorizedException, InternalServerErrorException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { createClient } from "@supabase/supabase-js";
import type { SupabaseClient } from "@supabase/supabase-js";
import { randomUUID } from "crypto";
import { createLogger } from "../../../core/logger";
import type {
  NaverTokenResponse,
  NaverUserProfile,
  NaverApiResponse,
  NaverOAuthState,
  NaverCallbackResult,
} from "../types";

const logger = createLogger("naver-auth");

@Injectable()
export class NaverAuthService {
  private readonly clientId: string;
  private readonly clientSecret: string;
  private readonly supabaseUrl: string;
  private readonly supabaseSecretKey: string;
  private readonly appUrl: string;

  constructor(private readonly configService: ConfigService) {
    this.clientId = this.configService.get<string>("NAVER_CLIENT_ID") ?? "";
    this.clientSecret = this.configService.get<string>("NAVER_CLIENT_SECRET") ?? "";
    this.supabaseUrl = this.configService.get<string>("SUPABASE_URL")
      ?? this.configService.get<string>("VITE_SUPABASE_URL")
      ?? "";
    this.supabaseSecretKey = this.configService.get<string>("SUPABASE_SECRET_KEY") ?? "";
    this.appUrl = this.configService.get<string>("APP_URL") ?? "http://localhost:3002";
  }

  /**
   * Naver OAuth 인증 URL 생성
   */
  getAuthorizationUrl(redirectTo: string): string {
    logger.info("Naver OAuth started", {
      "naver-auth.redirect_to": redirectTo,
    });

    const statePayload: NaverOAuthState = {
      redirectTo,
      csrf: randomUUID(),
    };
    const state = Buffer.from(JSON.stringify(statePayload)).toString("base64url");

    const callbackUrl = `${this.appUrl}/api/auth/naver/callback`;

    const params = new URLSearchParams({
      response_type: "code",
      client_id: this.clientId,
      redirect_uri: callbackUrl,
      state,
    });

    return `https://nid.naver.com/oauth2.0/authorize?${params.toString()}`;
  }

  /**
   * OAuth 콜백 처리 (code -> token -> profile -> supabase user -> verify URL)
   */
  async handleCallback(code: string, state: string): Promise<NaverCallbackResult> {
    let redirectTo: string;

    try {
      const statePayload: NaverOAuthState = JSON.parse(
        Buffer.from(state, "base64url").toString(),
      );
      redirectTo = statePayload.redirectTo;
    } catch {
      logger.error("Naver OAuth state decode failed", {
        "naver-auth.step": "state_decode",
      });
      throw new UnauthorizedException("Invalid OAuth state parameter");
    }

    try {
      // Step 1: Exchange code for token
      const tokenResponse = await this.exchangeCodeForToken(code);

      // Step 2: Get user profile
      const profile = await this.getUserProfile(tokenResponse.access_token);

      // Step 3: Find or create Supabase user and get verify URL
      const verifyUrl = await this.findOrCreateSupabaseUser(profile, redirectTo);

      logger.info("Naver OAuth completed", {
        "naver-auth.email": profile.email,
        "naver-auth.naver_id": profile.id,
      });

      return { redirectUrl: verifyUrl };
    } catch (error) {
      if (error instanceof UnauthorizedException || error instanceof InternalServerErrorException) {
        throw error;
      }

      const err = error as Error;
      logger.error("Naver OAuth failed", {
        "naver-auth.step": "callback",
        "error.type": err.constructor.name,
        "error.message": err.message,
      });
      throw new InternalServerErrorException("Naver OAuth callback failed");
    }
  }

  /**
   * Authorization code를 access token으로 교환
   */
  private async exchangeCodeForToken(code: string): Promise<NaverTokenResponse> {
    const callbackUrl = `${this.appUrl}/api/auth/naver/callback`;

    const params = new URLSearchParams({
      grant_type: "authorization_code",
      client_id: this.clientId,
      client_secret: this.clientSecret,
      code,
      redirect_uri: callbackUrl,
    });

    try {
      const response = await fetch(`https://nid.naver.com/oauth2.0/token?${params.toString()}`, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
      });

      if (!response.ok) {
        throw new Error(`Token exchange failed with status ${response.status}`);
      }

      const data = (await response.json()) as NaverTokenResponse;

      if (!data.access_token) {
        throw new Error("No access_token in response");
      }

      return data;
    } catch (error) {
      const err = error as Error;
      logger.error("Naver token exchange failed", {
        "naver-auth.step": "token_exchange",
        "error.type": err.constructor.name,
        "error.message": err.message,
      });
      throw new UnauthorizedException("Failed to exchange authorization code for token");
    }
  }

  /**
   * Access token으로 네이버 사용자 프로필 조회
   */
  private async getUserProfile(accessToken: string): Promise<NaverUserProfile> {
    try {
      const response = await fetch("https://openapi.naver.com/v1/nid/me", {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      });

      if (!response.ok) {
        throw new Error(`Profile API failed with status ${response.status}`);
      }

      const data = (await response.json()) as NaverApiResponse;

      if (data.resultcode !== "00") {
        throw new Error(`Naver API error: ${data.message}`);
      }

      const { response: naverUser } = data;

      return {
        id: naverUser.id,
        email: naverUser.email,
        name: naverUser.name,
        nickname: naverUser.nickname,
        profileImage: naverUser.profile_image,
      };
    } catch (error) {
      const err = error as Error;
      logger.error("Naver profile fetch failed", {
        "naver-auth.step": "profile_fetch",
        "error.type": err.constructor.name,
        "error.message": err.message,
      });
      throw new UnauthorizedException("Failed to fetch Naver user profile");
    }
  }

  /**
   * Supabase에서 사용자 조회/생성 후 magiclink verify URL 반환
   */
  private async findOrCreateSupabaseUser(
    profile: NaverUserProfile,
    redirectTo: string,
  ): Promise<string> {
    const supabaseAdmin = this.getSupabaseAdmin();

    try {
      // 1. 기존 사용자 검색 (email 기반)
      const { data: userList, error: listError } = await supabaseAdmin.auth.admin.listUsers();

      if (listError) {
        throw new Error(`Failed to list users: ${listError.message}`);
      }

      const existingUser = userList.users.find((u) => u.email === profile.email);

      let userId: string;

      if (existingUser) {
        // 기존 사용자 메타데이터 업데이트
        userId = existingUser.id;

        await supabaseAdmin.auth.admin.updateUserById(userId, {
          user_metadata: {
            ...existingUser.user_metadata,
            name: profile.name,
            avatar_url: profile.profileImage,
            naver_id: profile.id,
            provider: "naver",
          },
        });

        logger.info("Naver user found", {
          "naver-auth.email": profile.email,
          "naver-auth.user_id": userId,
        });
      } else {
        // 새 사용자 생성
        const { data: newUser, error: createError } = await supabaseAdmin.auth.admin.createUser({
          email: profile.email,
          email_confirm: true,
          user_metadata: {
            name: profile.name,
            avatar_url: profile.profileImage,
            naver_id: profile.id,
            provider: "naver",
          },
          app_metadata: {
            provider: "naver",
            providers: ["naver"],
          },
        });

        if (createError) {
          throw new Error(`Failed to create user: ${createError.message}`);
        }

        userId = newUser.user.id;

        logger.info("Naver user created", {
          "naver-auth.email": profile.email,
          "naver-auth.naver_id": profile.id,
          "naver-auth.user_id": userId,
        });
      }

      // 2. profiles 테이블의 auth_provider 업데이트
      await supabaseAdmin
        .from("profiles")
        .update({ auth_provider: "naver" })
        .eq("id", userId);

      // 3. Magiclink 생성
      const { data: linkData, error: linkError } = await supabaseAdmin.auth.admin.generateLink({
        type: "magiclink",
        email: profile.email,
      });

      if (linkError || !linkData) {
        throw new Error(`Failed to generate magic link: ${linkError?.message}`);
      }

      const hashedToken = linkData.properties.hashed_token;

      // 4. Verify URL 조립
      const verifyUrl = `${this.supabaseUrl}/auth/v1/verify?token=${hashedToken}&type=magiclink&redirect_to=${encodeURIComponent(redirectTo)}`;

      return verifyUrl;
    } catch (error) {
      const err = error as Error;
      logger.error("Supabase user management failed", {
        "naver-auth.step": "supabase_user",
        "naver-auth.email": profile.email,
        "error.type": err.constructor.name,
        "error.message": err.message,
      });
      throw new InternalServerErrorException("Failed to create or find user in authentication system");
    }
  }

  /**
   * Supabase Admin Client 생성
   */
  private getSupabaseAdmin(): SupabaseClient {
    return createClient(this.supabaseUrl, this.supabaseSecretKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    });
  }
}
