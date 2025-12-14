/**
 * Authentication types shared between main and renderer processes
 */

export interface AuthUser {
	id: string;
	name: string;
	email: string;
	avatarUrl: string | null;
}

export interface AuthState {
	isSignedIn: boolean;
	user: AuthUser | null;
}

export interface AuthSession {
	accessToken: string;
	accessTokenExpiresAt: number;
	refreshToken: string;
	refreshTokenExpiresAt: number;
	user: AuthUser;
}

/**
 * Token durations (configurable)
 */
export const TOKEN_CONFIG = {
	/** Access token lifetime in seconds (1 hour) */
	ACCESS_TOKEN_EXPIRY: 60 * 60,
	/** Refresh token lifetime in seconds (30 days) */
	REFRESH_TOKEN_EXPIRY: 30 * 24 * 60 * 60,
	/** Refresh access token when this many seconds remain (5 minutes) */
	REFRESH_THRESHOLD: 5 * 60,
} as const;

export type AuthProvider = "github" | "google";

export interface SignInResult {
	success: boolean;
	error?: string;
}

export interface SignOutResult {
	success: boolean;
}
