import type { createAuthStorage } from "mastracode";

export type AuthMethod = "api_key" | "oauth" | "env" | null;
export type AuthSource = "external" | "managed" | null;
export type AuthIssue = "expired" | null;

export interface AuthStatus {
	authenticated: boolean;
	method: AuthMethod;
	source: AuthSource;
	issue: AuthIssue;
	hasManagedOAuth?: boolean;
}

export type AuthStorageLike = ReturnType<typeof createAuthStorage>;

export type AuthStorageCredential = NonNullable<
	ReturnType<AuthStorageLike["get"]>
>;

export type StoredOAuthCredential = Extract<
	AuthStorageCredential,
	{ type: "oauth" }
>;

export type OAuthLoginCallbacks = Parameters<AuthStorageLike["login"]>[1];

export type OAuthAuthInfo = Parameters<OAuthLoginCallbacks["onAuth"]>[0];
