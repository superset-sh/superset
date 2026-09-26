import { CLIError } from "@superset/cli-framework";
import { startableCloudEnvironments } from "@superset/shared/cloud-environments";
import { command } from "../../../lib/command";

export default command({
	description: "List the environments a cloud workspace can start from",
	run: async ({ ctx }) => {
		const organizationId = ctx.config.organizationId;
		if (!organizationId) {
			throw new CLIError("No active organization", "Run: superset auth login");
		}

		const environments = await ctx.api.environment.list.query({
			organizationId,
		});
		const startable = new Set(
			startableCloudEnvironments(environments).map((row) => row.id),
		);

		return {
			data: environments,
			message:
				environments
					.map((row) =>
						[
							row.id,
							row.name,
							row.region,
							row.repositories.map((repo) => repo.fullName).join(", ") ||
								"no repositories — cannot start a workspace",
							startable.has(row.id) ? "" : "(unusable)",
						]
							.filter(Boolean)
							.join("  "),
					)
					.join("\n") || "No environments in this organization",
		};
	},
});
