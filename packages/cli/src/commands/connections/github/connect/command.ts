import { boolean, CLIError } from "@superset/cli-framework";
import { command } from "../../../../lib/command";
import { canReachDesktop, openUrl } from "../../../../lib/open-url";

const POLL_INTERVAL_MS = 2_000;
const POLL_TIMEOUT_MS = 5 * 60_000;

export default command({
	sandbox: false,
	description:
		"Connect your GitHub account in the browser so your cloud workspaces push and open pull requests as you",
	options: {
		noWait: boolean().desc("Print the authorize URL and exit without waiting"),
	},
	run: async ({ ctx, options }) => {
		const { connection: existing } = await ctx.api.githubUser.get.query();
		if (existing) {
			return {
				data: { connection: existing },
				message: `Already connected as ${existing.login}. To switch accounts, run: superset connections github disconnect`,
			};
		}
		const { url } = await ctx.api.githubUser.connect.mutate();
		const opened =
			canReachDesktop() &&
			(await openUrl(url).then(
				() => true,
				() => false,
			));
		if (options.noWait) {
			return {
				data: { url },
				message: `Open this URL to connect GitHub:\n  ${url}`,
			};
		}
		process.stderr.write(
			`${opened ? "If your browser did not open, open" : "Open"} this URL to connect GitHub:\n  ${url}\nWaiting for you to authorize…\n`,
		);
		const deadline = Date.now() + POLL_TIMEOUT_MS;
		while (Date.now() < deadline) {
			await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
			const { connection } = await ctx.api.githubUser.get.query();
			if (connection) {
				return {
					data: { connection },
					message: `Connected as ${connection.login}`,
				};
			}
		}
		throw new CLIError(
			"GitHub was not connected in 5 minutes",
			"Run: superset connections github connect",
		);
	},
});
