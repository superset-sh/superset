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

export type AuthProvider = "github" | "google";

export interface SignInResult {
	success: boolean;
	error?: string;
}
