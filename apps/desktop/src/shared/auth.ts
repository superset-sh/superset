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
	token: string;
	user: AuthUser;
	expiresAt: number;
}

export type AuthProvider = "github" | "google";

export interface SignInResult {
	success: boolean;
	error?: string;
}

export interface SignOutResult {
	success: boolean;
}
