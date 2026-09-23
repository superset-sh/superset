import { CLIError, string } from "@superset/cli-framework";
import { command } from "../../../lib/command";

const GROUPS = [
	"github",
	"linear",
	"sentry",
	"microsoftTeams",
	"google",
	"notion",
	"slack",
] as const;

export default command({
	description:
		"List the values an event trigger can filter on (Slack channels, GitHub repos, Linear teams, ...)",
	options: {
		group: string()
			.required()
			.desc(`Provider option group: ${GROUPS.join(", ")}`),
	},
	run: async ({ ctx, options }) => {
		const organizationId = ctx.config.organizationId;
		if (!organizationId) {
			throw new CLIError("No active organization", "Run: superset auth login");
		}
		if (!(GROUPS as readonly string[]).includes(options.group)) {
			throw new CLIError(
				`Unknown option group "${options.group}"`,
				`Pick one of: ${GROUPS.join(", ")}`,
			);
		}

		const options_ = await ctx.api.integration.triggerOptions.query({
			organizationId,
			group: options.group,
		});

		const summary = Object.entries(options_)
			.map(([key, values]) => `${key}: ${values.length}`)
			.join(", ");
		return {
			data: options_,
			message: summary
				? `${options.group} — ${summary}`
				: `${options.group} is not connected, or offers no lists`,
		};
	},
});
