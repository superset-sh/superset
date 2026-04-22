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

		// Clack's spinner redraws with ANSI cursor moves, which only works over a
		// real TTY. When stdout is piped (e.g. `bun run dev` → turbo → terminal)
		// every frame flushes as a new line, spamming the output.
		const spinner = process.stdout.isTTY ? p.spinner() : null;
		spinner?.start("Waiting for browser authorization...");
		if (!spinner) p.log.info("Waiting for browser authorization…");

		const result = await login(config, opts.signal);

		config.auth = {
			accessToken: result.accessToken,
			expiresAt: result.expiresAt,
		};
		writeConfig(config);

		spinner?.stop("Authorized!");
		if (!spinner) p.log.success("Authorized!");

		const api = createApiClient(config, { bearer: result.accessToken });

		try {
			const user = await api.user.me.query();
			p.log.info(`${user.name} (${user.email})`);
		} catch (error) {
			p.log.warn(
				`Could not fetch user profile: ${error instanceof Error ? error.message : String(error)}`,
			);
		}

		const organizations = await api.user.myOrganizations.query();

		let chosenId: string | undefined;
		if (organizations.length === 1) {
			chosenId = organizations[0]?.id;
		} else if (organizations.length > 1 && process.stdout.isTTY) {
			const sessionActive = await api.user.myOrganization.query();
			const selection = await p.select({
				message: "Select organization for this CLI",
				initialValue: sessionActive?.id ?? organizations[0]?.id,
				options: organizations.map((organization) => ({
					value: organization.id,
					label: `${organization.name} (${organization.slug})`,
				})),
			});
			if (p.isCancel(selection)) {
				p.cancel("Login cancelled");
				return { data: { apiUrl } };
			}
			chosenId = selection as string;
		}

		if (chosenId) {
			config.organizationId = chosenId;
			writeConfig(config);
			const chosen = organizations.find((o) => o.id === chosenId);
			if (chosen) p.log.info(`Organization: ${chosen.name}`);
		}

		p.outro("Logged in successfully.");
		return { data: { apiUrl } };
	},
});
