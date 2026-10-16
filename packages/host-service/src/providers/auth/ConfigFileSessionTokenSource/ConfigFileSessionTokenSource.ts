import { randomUUID } from "node:crypto";
import {
	chmod,
	mkdir,
	readFile,
	rename,
	stat,
	unlink,
	writeFile,
} from "node:fs/promises";
import { dirname, join } from "node:path";
import { resolveWriteTarget } from "@superset/agent-setup/write-file-if-changed";
import {
	isAuthFresh,
	REFRESH_TIMINGS,
	refreshLockPath,
	refreshStoredAuth,
	type StoredOAuth,
} from "@superset/shared/oauth-refresh";

const CLIENT_ID = "superset-cli";
const LOGIN_AGAIN_MESSAGE = "Session expired. Run: superset auth login";

type SupersetAuthConfig = {
	auth?: StoredOAuth;
	apiKey?: string;
	organizationId?: string;
};

type OAuthRefreshResponse = {
	access_token: string;
	token_type?: string;
	expires_in?: number;
	refresh_token?: string;
};

export type ConfigFileSessionTokenSourceOptions = {
	configPath: string;
	apiUrl: string;
};

async function readConfig(configPath: string): Promise<SupersetAuthConfig> {
	try {
		const fileStat = await stat(configPath);
		if ((fileStat.mode & 0o077) !== 0) {
			await chmod(configPath, 0o600).catch(() => undefined);
		}
	} catch (error) {
		if (error instanceof Error && "code" in error && error.code === "ENOENT") {
			return {};
		}
		throw error;
	}

	const raw = await readFile(configPath, "utf-8");
	return JSON.parse(raw) as SupersetAuthConfig;
}

async function writeConfig(
	configPath: string,
	config: SupersetAuthConfig,
): Promise<void> {
	await mkdir(dirname(configPath), { recursive: true, mode: 0o700 });

	const target = resolveWriteTarget(configPath);
	const tempPath = join(
		dirname(target),
		`.${randomUUID()}.${process.pid}.config.tmp`,
	);
	await writeFile(tempPath, JSON.stringify(config, null, 2), { mode: 0o600 });
	await chmod(tempPath, 0o600).catch(() => undefined);
	try {
		await rename(tempPath, target);
	} catch (error) {
		await unlink(tempPath).catch(() => undefined);
		throw error;
	}
	await chmod(target, 0o600).catch(() => undefined);
}

function loginAgainError(): Error {
	return new Error(LOGIN_AGAIN_MESSAGE);
}

const REFRESH_TIMEOUT_MS = 60_000;

export class ConfigFileSessionTokenSource {
	private readonly configPath: string;
	private readonly apiUrl: string;
	private refreshPromise: Promise<string> | null = null;
	private refreshNeeded = false;

	constructor(options: ConfigFileSessionTokenSourceOptions) {
		this.configPath = options.configPath;
		this.apiUrl = options.apiUrl;
	}

	invalidateCache(): void {
		this.refreshNeeded = true;
	}

	async getSessionToken(): Promise<string> {
		const config = await readConfig(this.configPath);

		const apiKey = config.apiKey?.trim();
		if (apiKey) return apiKey;

		const auth = config.auth;
		if (!auth) throw loginAgainError();
		if (!this.refreshNeeded) return auth.accessToken;

		if (this.refreshPromise) return this.refreshPromise;

		const rejectedAccessToken = auth.accessToken;
		this.refreshPromise = refreshStoredAuth<SupersetAuthConfig>(
			{
				refresh: (refreshToken) => this.refreshAccessToken(refreshToken),
				readConfig: () => readConfig(this.configPath),
				writeConfig: (next) => writeConfig(this.configPath, next),
				lockPath: refreshLockPath(this.configPath),
				...REFRESH_TIMINGS,
				now: () => Date.now(),
				sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
			},
			(stored, now) =>
				stored.accessToken !== rejectedAccessToken && isAuthFresh(stored, now),
		)
			.then((refreshed) => {
				this.refreshNeeded = false;
				return refreshed.apiKey?.trim() || refreshed.auth.accessToken;
			})
			.catch(() => {
				throw loginAgainError();
			})
			.finally(() => {
				this.refreshPromise = null;
			});

		return this.refreshPromise;
	}

	private async refreshAccessToken(refreshToken: string) {
		const response = await fetch(`${this.apiUrl}/api/auth/oauth2/token`, {
			method: "POST",
			signal: AbortSignal.timeout(REFRESH_TIMEOUT_MS),
			headers: { "Content-Type": "application/x-www-form-urlencoded" },
			body: new URLSearchParams({
				grant_type: "refresh_token",
				refresh_token: refreshToken,
				client_id: CLIENT_ID,
				resource: this.apiUrl,
			}),
		});
		if (!response.ok) {
			throw Object.assign(
				new Error(`Token refresh failed: ${response.status}`),
				{
					status: response.status,
				},
			);
		}
		const data = (await response.json()) as OAuthRefreshResponse;
		if (!data.access_token) throw new Error("Token refresh returned no token");
		return {
			accessToken: data.access_token,
			refreshToken: data.refresh_token ?? refreshToken,
			expiresAt: Date.now() + (data.expires_in ?? 60 * 60) * 1000,
		};
	}
}
