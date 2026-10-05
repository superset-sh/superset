import { CLIError, table } from "@superset/cli-framework";
import { command } from "../../../lib/command";

export default command({
	sandbox: false,
	description:
		"List the repositories the organization's GitHub App can see; these are what --repo accepts",
	display: (data) =>
		table(
			(data ?? []) as Record<string, unknown>[],
			["fullName", "defaultBranch", "visibility"],
			["REPOSITORY", "DEFAULT BRANCH", "VISIBILITY"],
			[48, 16, 10],
		),
	run: async ({ ctx }) => {
		const organizationId = ctx.config.organizationId;
		if (!organizationId) {
			throw new CLIError("No active organization", "Run: superset auth login");
		}
		const repositories =
			await ctx.api.integration.github.listRepositories.query({
				organizationId,
			});
		if (repositories.length === 0) {
			throw new CLIError(
				"No repositories connected to this organization",
				"Run: superset integrations github connect",
			);
		}
		return repositories
			.map((repo) => ({
				fullName: repo.fullName,
				defaultBranch: repo.defaultBranch,
				visibility: repo.isPrivate ? "private" : "public",
			}))
			.sort((a, b) => a.fullName.localeCompare(b.fullName));
	},
});
