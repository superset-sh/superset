import * as p from "@clack/prompts";
import { string } from "@superset/cli-framework";
import { createApiClient } from "../../../lib/api-client";
import { login } from "../../../lib/auth";
import { command } from "../../../lib/command";
import { getApiUrl, readConfig, writeConfig } from "../../../lib/config";

export default command({
	description: "Authenticate with Superset. Re-run to switch organizations.",
	skipMiddleware: true,
	options: {
		apiUrl: string().env("SUPERSET_API_URL").desc("Override API URL"),
	},
	run: async (opts) => {
		const config = readConfig();
		if (opts.options.apiUrl) config.apiUrl = opts.options.apiUrl;

		const apiUrl = getApiUrl(config);

		p.intro("superset auth login");

		const spinner = p.spinner();
		spinner.start("Waiting for browser authorization...");

		const result = await login(config, opts.signal);

		config.auth = {
			accessToken: result.accessToken,
			expiresAt: result.expiresAt,
		};
		writeConfig(config);

		spinner.stop("Authorized!");

		try {
			const api = createApiClient(config, { bearer: result.accessToken });
			const user = await api.user.me.query();
			const organization = await api.user.myOrganization.query();
			p.log.info(`${user.name} (${user.email})`);
			if (organization) p.log.info(`Organization: ${organization.name}`);
		} catch {
			// Non-fatal
		}

		p.outro("Logged in successfully.");
		return { data: { apiUrl } };
	},
});
