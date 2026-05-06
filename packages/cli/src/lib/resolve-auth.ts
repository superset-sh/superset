import { CLIError } from "@superset/cli-framework";
import { type ApiClient, createApiClient } from "./api-client";
import { refreshAccessToken } from "./auth";
import { readConfig, type SupersetConfig, writeConfig } from "./config";

export type AuthSource = "flag" | "env" | "oauth";

export type ResolvedAuth = {
	config: SupersetConfig;
	api: ApiClient;
	bearer: string;
	authSource: AuthSource;
};

const REFRESH_LEEWAY_MS = 5 * 60 * 1000;

export async function resolveAuth(
	apiKeyOption: string | undefined,
): Promise<ResolvedAuth> {
	let config = readConfig();

	let bearer = apiKeyOption?.trim();
	let authSource: AuthSource = bearer ? "flag" : "oauth";

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
	}

	const api = createApiClient({
		bearer,
		organizationId: config.organizationId,
	});
	return { config, api, bearer, authSource };
}
