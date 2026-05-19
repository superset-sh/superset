import * as fs from "node:fs";
import { dirname } from "node:path";
import { refreshAccessToken } from "@superset/shared/auth/token-refresh";
import {
	AuthRefreshFailedError,
	type AuthRefreshFailureReason,
} from "../../../errors";
import type { ApiAuthProvider } from "../types";

const JWT_REFRESH_BUFFER_MS = 5 * 60 * 1000;
const JWT_CACHE_DURATION_MS = 55 * 60 * 1000;

interface SupersetAuthConfig {
	accessToken: string;
	refreshToken?: string;
	expiresAt: number;
}

interface SupersetConfig {
	auth?: SupersetAuthConfig;
	apiKey?: string;
	organizationId?: string;
	[key: string]: unknown;
}

interface RefreshFailureClassification {
	reason: AuthRefreshFailureReason;
	statusCode?: number;
}

export interface JwtApiAuthProviderOptions {
	/**
	 * Returns the current session/api-key/JWT token to authenticate with.
	 * Used directly when no auth config path is available, and as a fallback
	 * when the config file has not been written yet.
	 */
	getSessionToken: () => Promise<string>;
	apiUrl: string;
	authConfigPath?: string;
}

function looksLikeJwt(token: string): boolean {
	const parts = token.split(".");
	return parts.length === 3 && parts.every(Boolean);
}

function readJwtExp(token: string): number | null {
	const parts = token.split(".");
	if (parts.length !== 3) return null;

	const payload = parts[1];
	if (!payload) return null;

	try {
		const parsed: unknown = JSON.parse(
			Buffer.from(payload, "base64url").toString("utf8"),
		);
		if (
			typeof parsed === "object" &&
			parsed !== null &&
			!Array.isArray(parsed) &&
			typeof (parsed as { exp?: unknown }).exp === "number"
		) {
			return (parsed as { exp: number }).exp * 1000;
		}
		return null;
	} catch {
		return null;
	}
}

function isObject(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isSupersetAuthConfig(value: unknown): value is SupersetAuthConfig {
	if (!isObject(value)) return false;
	return (
		typeof value.accessToken === "string" &&
		typeof value.expiresAt === "number" &&
		(value.refreshToken === undefined || typeof value.refreshToken === "string")
	);
}

function readStatusCode(error: unknown): number | undefined {
	if (isObject(error) && typeof error.statusCode === "number") {
		return error.statusCode;
	}
	const message = error instanceof Error ? error.message : String(error);
	const match = /Token refresh failed:\s*(\d{3})/.exec(message);
	if (!match?.[1]) return undefined;
	return Number.parseInt(match[1], 10);
}

function reasonForRefreshError(error: unknown): RefreshFailureClassification {
	const statusCode = readStatusCode(error);
	if (statusCode === undefined) {
		return { reason: "network_error" };
	}
	if (statusCode === 400 || statusCode === 401 || statusCode === 403) {
		return { reason: "invalid_grant", statusCode };
	}
	return { reason: "http_error", statusCode };
}

function readConfigAtPath(configPath: string): SupersetConfig {
	if (!fs.existsSync(configPath)) return {};
	const parsed: unknown = JSON.parse(fs.readFileSync(configPath, "utf-8"));
	return isObject(parsed) ? parsed : {};
}

function writeConfigAtPath(configPath: string, config: SupersetConfig): void {
	const configDir = dirname(configPath);
	if (!fs.existsSync(configDir)) {
		fs.mkdirSync(configDir, { recursive: true, mode: 0o700 });
	}
	try {
		const stat = fs.statSync(configDir);
		if ((stat.mode & 0o077) !== 0) fs.chmodSync(configDir, 0o700);
	} catch {}

	const tmpPath = `${configPath}.tmp`;
	fs.writeFileSync(tmpPath, JSON.stringify(config, null, 2), { mode: 0o600 });
	try {
		fs.chmodSync(tmpPath, 0o600);
	} catch {}
	fs.renameSync(tmpPath, configPath);
}

export class JwtApiAuthProvider implements ApiAuthProvider {
	private readonly loadSessionToken: () => Promise<string>;
	private readonly apiUrl: string;
	private readonly authConfigPath: string | undefined;
	private cachedJwt: string | null = null;
	private cachedJwtSessionToken: string | null = null;
	private cachedJwtExpiresAt = 0;
	private currentCredential: SupersetAuthConfig | null = null;
	private inflightRefresh: Promise<string> | null = null;

	constructor(options: JwtApiAuthProviderOptions) {
		this.loadSessionToken = options.getSessionToken;
		this.apiUrl = options.apiUrl;
		this.authConfigPath = options.authConfigPath;
	}

	async getHeaders(): Promise<Record<string, string>> {
		const jwt = await this.getJwt();
		return { Authorization: `Bearer ${jwt}` };
	}

	invalidateCache(): void {
		this.cachedJwt = null;
		this.cachedJwtSessionToken = null;
		this.cachedJwtExpiresAt = 0;
		this.currentCredential = null;
	}

	async getSessionToken(): Promise<string> {
		if (!this.authConfigPath) {
			return this.loadSessionToken();
		}

		const credential = this.currentCredential ?? this.readCurrentCredential();
		if (!credential) {
			return this.loadSessionToken();
		}
		this.currentCredential = credential;

		const expiresAt = readJwtExp(credential.accessToken);
		if (expiresAt === null || expiresAt - Date.now() > JWT_REFRESH_BUFFER_MS) {
			return credential.accessToken;
		}

		if (this.inflightRefresh) {
			return this.inflightRefresh;
		}

		this.inflightRefresh = this.refreshCredential(credential).finally(() => {
			this.inflightRefresh = null;
		});
		return this.inflightRefresh;
	}

	async getJwt(): Promise<string> {
		const sessionToken = await this.getSessionToken();

		// OAuth access tokens are already JWTs. Delegate to getSessionToken so
		// host-owned refresh and single-flight behavior run before pass-through.
		if (looksLikeJwt(sessionToken)) {
			return sessionToken;
		}

		if (
			this.cachedJwt &&
			this.cachedJwtSessionToken === sessionToken &&
			Date.now() < this.cachedJwtExpiresAt - JWT_REFRESH_BUFFER_MS
		) {
			return this.cachedJwt;
		}

		// better-auth's apiKey plugin reads `sk_live_…` from x-api-key, not
		// Authorization: Bearer; mirror what the CLI's tRPC client does in
		// packages/cli/src/lib/api-client.ts.
		const response = await fetch(`${this.apiUrl}/api/auth/token`, {
			headers: sessionToken.startsWith("sk_live_")
				? { "x-api-key": sessionToken }
				: { Authorization: `Bearer ${sessionToken}` },
		});
		if (!response.ok) {
			throw new Error(`Failed to mint JWT: ${response.status}`);
		}
		const data = (await response.json()) as { token: string };
		this.cachedJwt = data.token;
		this.cachedJwtSessionToken = sessionToken;
		this.cachedJwtExpiresAt = Date.now() + JWT_CACHE_DURATION_MS;
		return data.token;
	}

	private readCurrentCredential(): SupersetAuthConfig | null {
		if (!this.authConfigPath) return null;
		const config = readConfigAtPath(this.authConfigPath);
		return isSupersetAuthConfig(config.auth) ? config.auth : null;
	}

	private async refreshCredential(
		credential: SupersetAuthConfig,
	): Promise<string> {
		if (!credential.refreshToken) {
			throw new AuthRefreshFailedError({ reason: "invalid_grant" });
		}

		const refreshed = await this.runRefresh(credential.refreshToken);
		const nextCredential: SupersetAuthConfig = {
			accessToken: refreshed.accessToken,
			refreshToken: refreshed.refreshToken ?? credential.refreshToken,
			expiresAt: refreshed.expiresAt,
		};

		if (this.authConfigPath) {
			const latestConfig = readConfigAtPath(this.authConfigPath);
			writeConfigAtPath(this.authConfigPath, {
				...latestConfig,
				auth: nextCredential,
			});
		}

		this.currentCredential = nextCredential;
		this.cachedJwt = null;
		this.cachedJwtSessionToken = null;
		this.cachedJwtExpiresAt = 0;
		return nextCredential.accessToken;
	}

	private async runRefresh(refreshToken: string): Promise<SupersetAuthConfig> {
		try {
			const refreshed = await refreshAccessToken(refreshToken);
			return {
				accessToken: refreshed.accessToken,
				refreshToken: refreshed.refreshToken ?? refreshToken,
				expiresAt: refreshed.expiresAt,
			};
		} catch (error) {
			if (error instanceof AuthRefreshFailedError) throw error;
			const options = reasonForRefreshError(error);
			throw new AuthRefreshFailedError(options);
		}
	}
}
