export interface ClaudeCredentialBase {
	apiKey: string;
	source: "config" | "keychain";
	kind: "apiKey" | "oauth";
}

export interface ClaudeApiKeyCredentials extends ClaudeCredentialBase {
	kind: "apiKey";
}

export interface ClaudeOAuthCredentials extends ClaudeCredentialBase {
	kind: "oauth";
	source: "config";
	refreshToken?: string;
	expiresAt?: number;
	configPath: string;
}

export type ClaudeCredentials =
	| ClaudeApiKeyCredentials
	| ClaudeOAuthCredentials;

export interface ClaudeConfigFile {
	apiKey?: string;
	api_key?: string;
	oauthAccessToken?: string;
	oauth_access_token?: string;
	oauthRefreshToken?: string;
	oauth_refresh_token?: string;
	oauthExpiresAt?: number | string;
	oauth_expires_at?: number | string;
	claudeAiOauth?: {
		accessToken?: string;
		refreshToken?: string;
		expiresAt?: number | string;
	};
}

export interface GetCredentialsFromConfigOptions {
	configPaths?: string[];
}
