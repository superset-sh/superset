import { CLIError } from "@superset/cli-framework";
import { command } from "../../../../lib/command";

export default command({
	sandbox: false,
	description: "Show where the organization's GitHub App is installed",
	run: async ({ ctx }) => {
		const organizationId = ctx.config.organizationId;
		if (!organizationId) {
			throw new CLIError("No active organization", "Run: superset auth login");
		}
		const installation = await ctx.api.integration.github.getInstallation.query(
			{ organizationId },
		);
		if (!installation) {
			return {
				data: { installation: null, repositories: 0 },
				message:
					"The GitHub App is not installed. Run: superset integrations github connect",
			};
		}
		const repositories =
			await ctx.api.integration.github.listRepositories.query({
				organizationId,
			});
		return {
			data: { installation, repositories: repositories.length },
			message: `Installed on ${installation.accountLogin}${installation.suspended ? " (suspended)" : ""}; ${repositories.length} ${repositories.length === 1 ? "repository" : "repositories"}. List them with: superset environments repos`,
		};
	},
});
