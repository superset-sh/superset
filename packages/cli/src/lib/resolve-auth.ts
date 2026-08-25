import { CLIError } from "@superset/cli-framework";
import { type ApiClient, createApiClient } from "./api-client";
import { refreshAccessToken } from "./auth";
import { readConfig, type SupersetConfig, writeConfig } from "./config";
import { isProcessAlive, readManifest } from "./host/manifest";

export type AuthSource = "override" | "host" | "config" | "oauth";

export type ResolvedAuth = {
	config: SupersetConfig;
	api: ApiClient;
	bearer: string;
	authSource: AuthSource;
};

const REFRESH_LEEWAY_MS = 5 * 60 * 1000;
const HOST_SESSION_TIMEOUT_MS = 2_000;

type HostSessionAuth = {
	token: string;
	apiUrl?: string;
};

export function isSupersetTerminalContext(): boolean {
	return Boolean(
		process.env.SUPERSET_TERMINAL_ID || process.env.SUPERSET_WORKSPACE_ID,
	);
}

async function resolveHostSessionAuth(
	organizationId: string | undefined,
): Promise<HostSessionAuth | null> {
	if (!organizationId || !isSupersetTerminalContext()) return null;

	const manifest = readManifest(organizationId);
	if (!manifest || !isProcessAlive(manifest.pid)) return null;

	const controller = new AbortController();
	const timeout = setTimeout(() => controller.abort(), HOST_SESSION_TIMEOUT_MS);
	try {
		const response = await fetch(`${manifest.endpoint}/auth/session-jwt`, {
			signal: controller.signal,
			headers: { Authorization: `Bearer ${manifest.authToken}` },
		});
		if (!response.ok) return null;

		const data = (await response.json()) as {
			token?: unknown;
			apiUrl?: unknown;
		};
		if (typeof data.token !== "string" || data.token.trim() === "") {
			return null;
		}
		return {
			token: data.token.trim(),
			apiUrl: typeof data.apiUrl === "string" ? data.apiUrl : undefined,
		};
	} catch {
		return null;
	} finally {
		clearTimeout(timeout);
	}
}

export async function resolveAuth(
	apiKeyOption: string | undefined,
): Promise<ResolvedAuth> {
	let config = readConfig();

	// An explicit --api-key wins; otherwise SUPERSET_API_KEY env acts as an
	// override for this invocation (headless/CI). Both beat stored config/OAuth.
	const overrideKey =
		apiKeyOption?.trim() || process.env.SUPERSET_API_KEY?.trim();
	let bearer: string | undefined;
	let authSource: AuthSource;
	let apiUrl: string | undefined;

	// SUPERSET_ORGANIZATION_ID overrides the stored org for this invocation
	// (headless/CI, and dev where the CLI must target a specific local org),
	// mirroring how SUPERSET_API_KEY overrides the stored credential. Not
	// persisted to disk.
	const organizationId =
		process.env.SUPERSET_ORGANIZATION_ID?.trim() || config.organizationId;

	const hostSessionAuth = overrideKey
		? null
		: await resolveHostSessionAuth(organizationId);

	if (overrideKey) {
		bearer = overrideKey;
		authSource = "override";
	} else if (hostSessionAuth) {
		bearer = hostSessionAuth.token;
		apiUrl = hostSessionAuth.apiUrl;
		authSource = "host";
	} else if (config.apiKey?.trim()) {
		bearer = config.apiKey.trim();
		authSource = "config";
	} else if (config.auth) {
		const auth = config.auth;
		if (auth.expiresAt - REFRESH_LEEWAY_MS < Date.now()) {
			if (!auth.refreshToken) {
				throw new CLIError("Session expired", "Run: superset auth login");
			}
			try {
				const refreshed = await refreshAccessToken(auth.refreshToken);
				config = {
					...config,
					auth: {
						accessToken: refreshed.accessToken,
						refreshToken: refreshed.refreshToken,
						expiresAt: refreshed.expiresAt,
					},
				};
				writeConfig(config);
				bearer = refreshed.accessToken;
			} catch {
				throw new CLIError("Session expired", "Run: superset auth login");
			}
		} else {
			bearer = auth.accessToken;
		}
		authSource = "oauth";
	} else {
		throw new CLIError(
			"Not logged in",
			"Run: superset auth login (or set SUPERSET_API_KEY)",
		);
	}

	const resolvedConfig: SupersetConfig = { ...config, organizationId };

	const api = createApiClient({ bearer, organizationId, apiUrl });
	return { config: resolvedConfig, api, bearer, authSource };
}
