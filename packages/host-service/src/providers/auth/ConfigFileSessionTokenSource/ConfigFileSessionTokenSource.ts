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

const CLIENT_ID = "superset-cli";
const LOGIN_AGAIN_MESSAGE = "Session expired. Run: superset auth login";

type SupersetAuthConfig = {
	auth?: {
		accessToken: string;
		refreshToken?: string;
		expiresAt: number;
	};
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
	const configDir = dirname(configPath);
	await mkdir(configDir, { recursive: true, mode: 0o700 });

	const tempPath = join(
		configDir,
		`.${randomUUID()}.${process.pid}.config.tmp`,
	);
	await writeFile(tempPath, JSON.stringify(config, null, 2), { mode: 0o600 });
	await chmod(tempPath, 0o600).catch(() => undefined);
	try {
		await rename(tempPath, configPath);
	} catch (error) {
		await unlink(tempPath).catch(() => undefined);
		throw error;
	}
	await chmod(configPath, 0o600).catch(() => undefined);
}

function loginAgainError(): Error {
	return new Error(LOGIN_AGAIN_MESSAGE);
}

function authMatches(
	left: NonNullable<SupersetAuthConfig["auth"]>,
	right: NonNullable<SupersetAuthConfig["auth"]>,
): boolean {
	return (
		left.accessToken === right.accessToken &&
		left.refreshToken === right.refreshToken &&
		left.expiresAt === right.expiresAt
	);
}

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

		if (!auth.refreshToken) throw loginAgainError();
		this.refreshPromise = this.refreshAccessToken(auth).finally(() => {
			this.refreshPromise = null;
		});

		return this.refreshPromise;
	}

	private async refreshAccessToken(
		auth: NonNullable<SupersetAuthConfig["auth"]>,
	): Promise<string> {
		if (!auth.refreshToken) throw loginAgainError();

		let response: Response;
		try {
			response = await fetch(`${this.apiUrl}/api/auth/oauth2/token`, {
				method: "POST",
				headers: { "Content-Type": "application/x-www-form-urlencoded" },
				body: new URLSearchParams({
					grant_type: "refresh_token",
					refresh_token: auth.refreshToken,
					client_id: CLIENT_ID,
					resource: this.apiUrl,
				}),
			});
		} catch {
			throw loginAgainError();
		}

		if (!response.ok) throw loginAgainError();

		let data: OAuthRefreshResponse;
		try {
			data = (await response.json()) as OAuthRefreshResponse;
		} catch {
			throw loginAgainError();
		}

		if (!data.access_token) throw loginAgainError();

		const nextAuth = {
			accessToken: data.access_token,
			refreshToken: data.refresh_token ?? auth.refreshToken,
			expiresAt: Date.now() + (data.expires_in ?? 60 * 60) * 1000,
		};

		const latestConfig = await readConfig(this.configPath);
		const latestApiKey = latestConfig.apiKey?.trim();
		if (latestApiKey) {
			this.refreshNeeded = false;
			return latestApiKey;
		}
		if (!latestConfig.auth) throw loginAgainError();

		if (!authMatches(latestConfig.auth, auth)) {
			this.refreshNeeded = false;
			return latestConfig.auth.accessToken;
		}

		await writeConfig(this.configPath, {
			...latestConfig,
			auth: nextAuth,
		});

		this.refreshNeeded = false;
		return nextAuth.accessToken;
	}
}
