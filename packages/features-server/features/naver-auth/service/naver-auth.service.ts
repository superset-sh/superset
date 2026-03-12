/**
 * Naver Auth Feature - Service
 *
 * Naver OAuth 2.0 서버사이드 인증 처리.
 * Better Auth users/accounts/sessions 테이블을 직접 사용하여 사용자 생성/조회 및 세션 발급.
 */

import { Injectable, Inject, UnauthorizedException, InternalServerErrorException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { eq, and } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { randomUUID } from "crypto";
import { DRIZZLE, baUsers, baAccounts, baSessions, profiles } from "@superbuilder/features-db";
import { createLogger } from "../../../core/logger";
import type {
  NaverTokenResponse,
  NaverUserProfile,
  NaverApiResponse,
  NaverOAuthState,
  NaverCallbackResult,
} from "../types";

const logger = createLogger("naver-auth");

/** 세션 토큰 생성 (crypto.randomUUID 기반) */
function generateSessionToken(): string {
  return randomUUID();
}

@Injectable()
export class NaverAuthService {
  private readonly clientId: string;
  private readonly clientSecret: string;
  private readonly appUrl: string;

  constructor(
    private readonly configService: ConfigService,
    @Inject(DRIZZLE) private readonly db: NodePgDatabase<Record<string, never>>,
  ) {
    this.clientId = this.configService.get<string>("NAVER_CLIENT_ID") ?? "";
    this.clientSecret = this.configService.get<string>("NAVER_CLIENT_SECRET") ?? "";
    this.appUrl = this.configService.get<string>("APP_URL")
      ?? this.configService.get<string>("NEXT_PUBLIC_API_URL")
      ?? "http://localhost:3002";
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
   * OAuth 콜백 처리 (code -> token -> profile -> Better Auth user -> session)
   *
   * @returns redirectUrl + sessionToken (컨트롤러에서 Set-Cookie 처리)
   */
  async handleCallback(
    code: string,
    state: string,
    ipAddress?: string,
    userAgent?: string,
  ): Promise<NaverCallbackResult & { sessionToken: string; sessionExpiresAt: Date }> {
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
      const naverProfile = await this.getUserProfile(tokenResponse.access_token);

      // Step 3: Find or create Better Auth user + session
      const { sessionToken, expiresAt } = await this.findOrCreateUser(
        naverProfile,
        tokenResponse,
        ipAddress,
        userAgent,
      );

      logger.info("Naver OAuth completed", {
        "naver-auth.email": naverProfile.email,
        "naver-auth.naver_id": naverProfile.id,
      });

      return {
        redirectUrl: redirectTo,
        sessionToken,
        sessionExpiresAt: expiresAt,
      };
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
   * Better Auth 테이블에서 사용자 조회/생성 후 세션 토큰 반환
   */
  private async findOrCreateUser(
    profile: NaverUserProfile,
    tokenResponse: NaverTokenResponse,
    ipAddress?: string,
    userAgent?: string,
  ): Promise<{ sessionToken: string; expiresAt: Date }> {
    try {
      // 1. 기존 사용자 검색 (email 기반 — baUsers 테이블)
      const [existingUser] = await this.db
        .select()
        .from(baUsers)
        .where(eq(baUsers.email, profile.email))
        .limit(1);

      let userId: string;

      if (existingUser) {
        userId = existingUser.id;

        // 사용자 정보 업데이트 (이름, 이미지)
        await this.db
          .update(baUsers)
          .set({
            name: profile.name,
            image: profile.profileImage ?? existingUser.image,
          })
          .where(eq(baUsers.id, userId));

        // Naver 계정이 연결되어 있지 않으면 추가
        const [existingAccount] = await this.db
          .select()
          .from(baAccounts)
          .where(
            and(
              eq(baAccounts.userId, userId),
              eq(baAccounts.providerId, "naver"),
            ),
          )
          .limit(1);

        if (!existingAccount) {
          await this.db.insert(baAccounts).values({
            accountId: profile.id,
            providerId: "naver",
            userId,
            accessToken: tokenResponse.access_token,
            refreshToken: tokenResponse.refresh_token,
            accessTokenExpiresAt: new Date(Date.now() + tokenResponse.expires_in * 1000),
          });
        } else {
          // 토큰 갱신
          await this.db
            .update(baAccounts)
            .set({
              accessToken: tokenResponse.access_token,
              refreshToken: tokenResponse.refresh_token,
              accessTokenExpiresAt: new Date(Date.now() + tokenResponse.expires_in * 1000),
            })
            .where(eq(baAccounts.id, existingAccount.id));
        }

        logger.info("Naver user found", {
          "naver-auth.email": profile.email,
          "naver-auth.user_id": userId,
        });
      } else {
        // 새 사용자 생성 (baUsers)
        const [newUser] = await this.db
          .insert(baUsers)
          .values({
            name: profile.name,
            email: profile.email,
            emailVerified: true,
            image: profile.profileImage,
          })
          .returning();

        userId = newUser!.id;

        // Naver 계정 연결 (baAccounts)
        await this.db.insert(baAccounts).values({
          accountId: profile.id,
          providerId: "naver",
          userId,
          accessToken: tokenResponse.access_token,
          refreshToken: tokenResponse.refresh_token,
          accessTokenExpiresAt: new Date(Date.now() + tokenResponse.expires_in * 1000),
        });

        // profiles 테이블에도 생성 (기존 Feature들이 profiles를 참조하므로)
        await this.db.insert(profiles).values({
          id: userId,
          name: profile.name,
          email: profile.email,
          avatar: profile.profileImage,
          authProvider: "naver",
        });

        logger.info("Naver user created", {
          "naver-auth.email": profile.email,
          "naver-auth.naver_id": profile.id,
          "naver-auth.user_id": userId,
        });
      }

      // 2. profiles 테이블의 auth_provider 업데이트
      await this.db
        .update(profiles)
        .set({ authProvider: "naver" })
        .where(eq(profiles.id, userId));

      // 3. Better Auth 세션 생성 (baSessions 테이블)
      const sessionToken = generateSessionToken();
      const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000); // 30일

      await this.db.insert(baSessions).values({
        token: sessionToken,
        userId,
        expiresAt,
        ipAddress: ipAddress ?? null,
        userAgent: userAgent ?? null,
      });

      return { sessionToken, expiresAt };
    } catch (error) {
      const err = error as Error;
      logger.error("Better Auth user management failed", {
        "naver-auth.step": "user_management",
        "naver-auth.email": profile.email,
        "error.type": err.constructor.name,
        "error.message": err.message,
      });
      throw new InternalServerErrorException("Failed to create or find user in authentication system");
    }
  }
}
