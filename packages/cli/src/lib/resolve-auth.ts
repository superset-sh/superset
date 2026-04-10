import { CLIError } from "@superset/cli-framework";
import { type ApiClient, createApiClient } from "./api-client";
import { refreshAccessToken } from "./auth";
import { readConfig, type SupersetConfig } from "./config";

const REFRESH_LEEWAY_MS = 5 * 60 * 1000;

export type AuthSource = "flag" | "env" | "oauth";

export type ResolvedAuth = {
	config: SupersetConfig;
	api: ApiClient;
	bearer: string;
	authSource: AuthSource;
};

/**
 * Shared bearer resolution used by the root middleware AND by commands that
 * skip the middleware (the `auth` and `host` groups). Single source of truth
 * for the precedence rule and the OAuth refresh logic.
 *
 * Precedence (explicit wins):
 *   1. `--api-key` global flag
 *   2. `SUPERSET_API_KEY` env var (also surfaces via `apiKey` global)
 *   3. Stored OAuth access token from `~/superset/config.json`, refreshed
 *      pre-emptively if it's within 5 minutes of expiry
 */
export async function resolveAuth(
	apiKeyOption: string | undefined,
): Promise<ResolvedAuth> {
	const config = readConfig();

	let bearer = apiKeyOption?.trim();
	let authSource: AuthSource = bearer ? "flag" : "oauth";

	// `apiKey` global has `.env("SUPERSET_API_KEY")`, so the framework merges
	// the env var into `apiKeyOption` automatically. Distinguish env vs flag
	// by inspecting argv so reporting in `auth check` is accurate.
	if (bearer && !process.argv.some((arg) => arg.startsWith("--api-key"))) {
		authSource = "env";
	}

	if (!bearer) {
		if (!config.auth) {
			throw new CLIError(
				"Not logged in",
				"Run: superset auth login (or set SUPERSET_API_KEY)",
			);
		}
		if (config.auth.expiresAt - Date.now() < REFRESH_LEEWAY_MS) {
			await refreshAccessToken(config);
		}
		bearer = config.auth.accessToken;
	}

	const api = createApiClient(config, { bearer });
	return { config, api, bearer, authSource };
}
