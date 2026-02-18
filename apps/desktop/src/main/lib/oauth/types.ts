export type OAuthProvider = "anthropic" | "openai";

export interface OAuthCredentials {
	accessToken: string;
	refreshToken?: string;
	expiresAt?: number;
	scope?: string;
	tokenType?: string;
}

export interface OAuthProviderStatus {
	provider: OAuthProvider;
	connected: boolean;
	expired: boolean;
	expiresAt?: number;
}
