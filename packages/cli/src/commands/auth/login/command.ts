import * as p from "@clack/prompts";
import { CLIError, string } from "@superset/cli-framework";
import { createApiClient } from "../../../lib/api-client";
import { login } from "../../../lib/auth";
import { command } from "../../../lib/command";
import { readConfig, writeConfig } from "../../../lib/config";

export default command({
	description: "Authenticate with Superset. Re-run to switch organizations.",
	skipMiddleware: true,
	options: {
		organization: string().desc(
			"Organization id or slug — required for non-TTY logins when you belong to multiple orgs",
		),
	},
	run: async (opts) => {
		const config = readConfig();

		p.intro("superset auth login");

		const spinner = process.stdout.isTTY ? p.spinner() : null;
		let spinnerActive = false;

		const result = await login(opts.signal, {
			onAuthorizationUrl: (url, mode) => {
				p.log.step("Opening browser to authorize…");
				p.log.message("If the browser didn't open, visit:");
				p.log.message(url);
				if (mode === "loopback") {
					if (spinner) {
						spinner.start("Waiting for browser callback…");
						spinnerActive = true;
					} else {
						p.log.info("Waiting for browser callback…");
					}
				}
			},
			promptForPastedCode: async () => {
				const pasted = await p.text({
					message: "Paste the code from the browser",
					validate: (value) =>
						value.includes("#") ? undefined : "Paste the entire value",
				});
				if (p.isCancel(pasted)) {
					throw new CLIError("Login cancelled");
				}
				return pasted;
			},
		});

		if (spinnerActive) {
			spinner?.stop();
			spinnerActive = false;
		}

		config.auth = {
			accessToken: result.accessToken,
			refreshToken: result.refreshToken,
			expiresAt: result.expiresAt,
		};
		writeConfig(config);

		p.log.success("Authorized!");

		const api = createApiClient({ bearer: result.accessToken });

		try {
			const user = await api.user.me.query();
			p.log.info(`${user.name} (${user.email})`);
		} catch (error) {
			p.log.warn(
				`Could not fetch user profile: ${error instanceof Error ? error.message : String(error)}`,
			);
		}

		const organizations = await api.user.myOrganizations.query();
		const sessionActive = await api.user.myOrganization.query();

		const explicitChoice = opts.options.organization
			? organizations.find(
					(org) =>
						org.id === opts.options.organization ||
						org.slug === opts.options.organization,
				)
			: undefined;

		if (opts.options.organization && !explicitChoice) {
			throw new CLIError(
				`Organization not found: ${opts.options.organization}`,
				`Available: ${organizations.map((o) => o.slug).join(", ")}`,
			);
		}

		let chosen = explicitChoice ?? sessionActive ?? null;

		if (!chosen) {
			if (organizations.length === 1) {
				chosen = organizations[0] ?? null;
			} else if (organizations.length > 1) {
				if (!process.stdout.isTTY) {
					throw new CLIError(
						"Multiple organizations available; pass --organization <slug>",
						`Available: ${organizations.map((o) => o.slug).join(", ")}`,
					);
				}
				const selection = await p.select({
					message: "Select organization for this CLI",
					initialValue: organizations[0]?.id,
					options: organizations.map((organization) => ({
						value: organization.id,
						label: `${organization.name} (${organization.slug})`,
					})),
				});
				if (p.isCancel(selection)) {
					p.cancel("Login cancelled");
					return { data: { loggedIn: true } };
				}
				chosen = organizations.find((o) => o.id === selection) ?? null;
			}
		}

		if (chosen) {
			config.organizationId = chosen.id;
			writeConfig(config);
			p.log.info(`Organization: ${chosen.name}`);
		}

		p.outro("Logged in successfully.");
		return {
			data: chosen
				? {
						userId: (await api.user.me.query()).id,
						organizationId: chosen.id,
						organizationName: chosen.name,
					}
				: { loggedIn: true },
		};
	},
});
