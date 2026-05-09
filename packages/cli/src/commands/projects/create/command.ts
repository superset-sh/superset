import { CLIError, string } from "@superset/cli-framework";
import { command } from "../../../lib/command";

export default command({
	description: "Create a project in the active organization",
	options: {
		name: string().required().desc("Project name"),
		slug: string().required().desc("URL-safe project slug, unique per org"),
		repoCloneUrl: string().desc(
			"GitHub clone URL (https or ssh). Optional — empty-mode projects have no remote",
		),
	},
	run: async ({ ctx, options }) => {
		const organizationId = ctx.config.organizationId;
		if (!organizationId) {
			throw new CLIError("No active organization", "Run: superset auth login");
		}

		const project = await ctx.api.v2Project.create.mutate({
			organizationId,
			name: options.name,
			slug: options.slug,
			repoCloneUrl: options.repoCloneUrl ?? undefined,
		});

		return {
			data: project,
			message: `Created project "${project.name}" (${project.id})`,
		};
	},
});
