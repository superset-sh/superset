import * as p from "@clack/prompts";
import { command, string } from "@superset/cli-framework";
import { createApiClient } from "../../../lib/api-client";
import { deviceAuth } from "../../../lib/auth";
import { getApiUrl, readConfig, writeConfig } from "../../../lib/config";

export default command({
	description: "Authenticate with Superset",

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

		const result = await deviceAuth(apiUrl, opts.signal);

		config.auth = { accessToken: result.token };
		writeConfig(config);

		s.stop("Authorized!");

		// The user picked an org during the OAuth consent screen — read it back
		// and cache locally so `host start` and other commands know which org to use.
		try {
			const api = createApiClient(config);
			const user = await api.user.me.query();
			const org = await api.user.myOrganization.query();
			p.log.info(`${user.name} (${user.email})`);

			if (org) {
				config.activeOrg = { id: org.id, name: org.name, slug: org.slug };
				writeConfig(config);
				p.log.info(`Organization: ${org.name}`);
			} else {
				p.log.warn("No organization selected.");
			}
		} catch {
			// Non-fatal — login succeeded even if whoami fails
		}

		p.outro("Logged in successfully.");

		return { data: { apiUrl, activeOrg: config.activeOrg } };
	},
});
