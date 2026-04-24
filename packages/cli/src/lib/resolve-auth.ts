import { CLIError } from "@superset/cli-framework";
import { type ApiClient, createApiClient } from "./api-client";
import { readConfig, type SupersetConfig } from "./config";

export type AuthSource = "flag" | "env" | "oauth";

export type ResolvedAuth = {
	config: SupersetConfig;
	api: ApiClient;
	bearer: string;
	authSource: AuthSource;
};

export async function resolveAuth(
	apiKeyOption: string | undefined,
): Promise<ResolvedAuth> {
	const config = readConfig();

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
		if (config.auth.expiresAt < Date.now()) {
			throw new CLIError("Session expired", "Run: superset auth login");
		}
		bearer = config.auth.accessToken;
	}

	const api = createApiClient(config, {
		bearer,
		organizationId: config.organizationId,
	});
	return { config, api, bearer, authSource };
}
