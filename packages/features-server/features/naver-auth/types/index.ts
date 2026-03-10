/**
 * Naver Auth Feature - Types
 */

export interface NaverTokenResponse {
  access_token: string;
  refresh_token: string;
  token_type: string;
  expires_in: number;
}

export interface NaverUserProfile {
  id: string;
  email: string;
  name: string;
  nickname?: string;
  profileImage?: string;
}

export interface NaverApiResponse {
  resultcode: string;
  message: string;
  response: {
    id: string;
    email: string;
    name: string;
    nickname?: string;
    profile_image?: string;
  };
}

export interface NaverOAuthState {
  redirectTo: string;
  csrf: string;
}

export interface NaverCallbackResult {
  redirectUrl: string;
}
