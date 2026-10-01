import { boolean, CLIError } from "@superset/cli-framework";
import { command } from "../../../../lib/command";
import { getApiUrl } from "../../../../lib/config";
import { canReachDesktop, openUrl } from "../../../../lib/open-url";

const POLL_INTERVAL_MS = 3_000;
const POLL_TIMEOUT_MS = 10 * 60_000;

export default command({
	sandbox: false,
	description:
		"Install the Superset GitHub App for the organization in the browser, so its repositories can back cloud environments",
	options: {
		noWait: boolean().desc("Print the install URL and exit without waiting"),
	},
	run: async ({ ctx, options }) => {
		const organizationId = ctx.config.organizationId;
		if (!organizationId) {
			throw new CLIError("No active organization", "Run: superset auth login");
		}
		const existing = await ctx.api.integration.github.getInstallation.query({
			organizationId,
		});
		if (existing) {
			return {
				data: { installation: existing },
				message: `Already installed on ${existing.accountLogin}. Choose which repositories it can see in that account's GitHub settings.`,
			};
		}

		const url = `${getApiUrl()}/api/github/install?organizationId=${organizationId}`;
		const opened =
			canReachDesktop() &&
			(await openUrl(url).then(
				() => true,
				() => false,
			));
		const instructions = `${opened ? "If your browser did not open, open" : "Open"} this URL, signed in to Superset in that browser, to install the GitHub App:\n  ${url}`;
		if (options.noWait) {
			return { data: { url }, message: instructions };
		}
		process.stderr.write(`${instructions}\nWaiting for the installation…\n`);

		const deadline = Date.now() + POLL_TIMEOUT_MS;
		while (Date.now() < deadline) {
			await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
			const installation =
				await ctx.api.integration.github.getInstallation.query({
					organizationId,
				});
			if (installation) {
				return {
					data: { installation },
					message: `Installed on ${installation.accountLogin}. Its repositories appear within a minute: superset environments repos`,
				};
			}
		}
		throw new CLIError(
			"The GitHub App was not installed in 10 minutes",
			"Run: superset integrations github connect",
		);
	},
});
