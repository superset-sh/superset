/**
 * Naver Auth Feature - Server
 *
 * Naver OAuth 2.0 서버사이드 인증.
 * OAuth redirect flow 특성상 tRPC Router 없이 REST Controller만 제공.
 */

export { NaverAuthModule } from "./naver-auth.module";
export { NaverAuthService } from "./service";
export { NaverAuthController } from "./controller";
export type * from "./types";
