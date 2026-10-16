import { CLIError } from "@superset/cli-framework";
import { type ApiClient, createApiClient } from "./api-client";
import {
	readConfig,
	resolveOrganizationId,
	type SupersetConfig,
} from "./config";
import { readHostApiToken } from "./host-api-token";
import {
	isAuthFresh,
	RefreshInProgressError,
	refreshStoredAuth,
	ServerUnreachableError,
	SessionExpiredError,
} from "./oauth-refresh";

export type AuthSource = "override" | "host" | "config" | "oauth" | "sandbox";

export type ResolvedAuth = {
	config: SupersetConfig;
	api: ApiClient;
	bearer: string;
	authSource: AuthSource;
};

export async function resolveAuth(
	apiKeyOption: string | undefined,
	{ useHostToken = true }: { useHostToken?: boolean } = {},
): Promise<ResolvedAuth> {
	let config = readConfig();

	// An explicit --api-key wins; otherwise SUPERSET_API_KEY env acts as an
	// override for this invocation (headless/CI). Both beat stored config/OAuth.
	const overrideKey =
		apiKeyOption?.trim() || process.env.SUPERSET_API_KEY?.trim();
	let bearer: string | undefined;
	let authSource: AuthSource;
	const hostToken =
		!overrideKey && useHostToken ? await readHostApiToken() : null;

	if (overrideKey) {
		bearer = overrideKey;
		authSource = "override";
	} else if (hostToken) {
		bearer = hostToken;
		authSource = "host";
	} else if (config.apiKey?.trim()) {
		bearer = config.apiKey.trim();
		authSource = "config";
	} else if (config.auth) {
		const auth = config.auth;
		if (!isAuthFresh(auth, Date.now())) {
			try {
				const refreshed = await refreshStoredAuth();
				config = refreshed;
				bearer = refreshed.auth.accessToken;
			} catch (error) {
				throw refreshFailureToCLIError(error);
			}
		} else {
			bearer = auth.accessToken;
		}
		authSource = "oauth";
	} else if (process.env.SUPERSET_SANDBOX_WORKSPACE_ID) {
		// A cloud workspace holds no credential: the firewall adds one to
		// requests for the API, and it names the workspace rather than a
		// person. Nothing to send from here, and nothing to refresh.
		bearer = "";
		authSource = "sandbox";
	} else {
		throw new CLIError(
			"Not logged in",
			"Run: superset auth login (or set SUPERSET_API_KEY)",
		);
	}

	const organizationId = resolveOrganizationId(config);
	const resolvedConfig: SupersetConfig = { ...config, organizationId };

	const api = createApiClient({ bearer, organizationId });
	return { config: resolvedConfig, api, bearer, authSource };
}

function refreshFailureToCLIError(error: unknown): CLIError {
	if (error instanceof RefreshInProgressError) {
		return new CLIError(
			"Another superset command is renewing the login",
			"Retry in a few seconds",
		);
	}
	if (error instanceof ServerUnreachableError) {
		return new CLIError(
			"Could not reach Superset to renew the login",
			"Check your connection and retry",
		);
	}
	if (error instanceof SessionExpiredError) {
		return new CLIError("Session expired", "Run: superset auth login");
	}
	return new CLIError(
		"Could not renew the login",
		"Retry in a minute. If it keeps failing, run: superset auth login",
	);
}
