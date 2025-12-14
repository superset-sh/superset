/**
 * Authentication types shared between main and renderer processes
 */

/**
 * Auth session - just tokens, user data fetched separately via tRPC
 */
export interface AuthSession {
	accessToken: string;
	accessTokenExpiresAt: number;
	refreshToken: string;
	refreshTokenExpiresAt: number;
}

export const AUTH_PROVIDERS = ["github", "google"] as const;
export type AuthProvider = (typeof AUTH_PROVIDERS)[number];

export interface SignInResult {
	success: boolean;
	error?: string;
}
