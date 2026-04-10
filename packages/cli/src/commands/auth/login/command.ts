import * as p from "@clack/prompts";
import { command, string } from "@superset/cli-framework";
import { createApiClient } from "../../../lib/api-client";
import { authorizationCodeAuth, decodeJwtPayload } from "../../../lib/auth";
import { getApiUrl, readConfig, writeConfig } from "../../../lib/config";

export default command({
	description:
		"Authenticate with Superset. Re-run to switch organizations — the org you pick on the consent screen is pinned to the new session.",

	options: {
		apiUrl: string().env("SUPERSET_API_URL").desc("Override API URL"),
	},

	run: async (opts) => {
		const config = readConfig();
		if (opts.options.apiUrl) config.apiUrl = opts.options.apiUrl;

		const apiUrl = getApiUrl(config);

		p.intro("superset auth login");

		const s = p.spinner();
		s.start("Waiting for browser authorization...");

		const result = await authorizationCodeAuth(apiUrl, opts.signal);

		config.auth = {
			accessToken: result.accessToken,
			refreshToken: result.refreshToken,
			expiresAt: result.expiresAt,
		};
		writeConfig(config);

		s.stop("Authorized!");

		// Display who we just signed in as. The org is baked into the JWT
		// claim by `customAccessTokenClaims`, so we don't need a server round
		// trip just to know its ID — but we still call `myOrganization` to
		// fetch the human-readable name for output. Best-effort: a failure
		// here is non-fatal because login itself succeeded.
		try {
			const api = createApiClient(config, { bearer: result.accessToken });
			const user = await api.user.me.query();
			p.log.info(`${user.name} (${user.email})`);

			const org = await api.user.myOrganization.query();
			if (org) {
				p.log.info(`Organization: ${org.name}`);
			} else {
				p.log.warn("No organization selected.");
			}
		} catch {
			// Non-fatal — login succeeded even if whoami fails
		}

		p.outro("Logged in successfully.");

		// Return the org from the JWT claim so JSON consumers see what's in
		// the token, not a separate lookup that could disagree.
		const payload = decodeJwtPayload(result.accessToken);
		return {
			data: {
				apiUrl,
				organizationId:
					typeof payload.organizationId === "string"
						? payload.organizationId
						: null,
			},
		};
	},
});
