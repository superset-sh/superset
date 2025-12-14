export { AUTH_PROVIDERS, type AuthProvider } from "@superset/shared/constants";

/**
 * Auth session - just tokens, user data fetched separately via tRPC
 */
export interface AuthSession {
	accessToken: string;
	accessTokenExpiresAt: number;
	refreshToken: string;
	refreshTokenExpiresAt: number;
}

export interface SignInResult {
	success: boolean;
	error?: string;
}
