import { CLIError, string } from "@superset/cli-framework";
import {
	SANDBOX_REGION_IDS,
	type SandboxRegionId,
} from "@superset/shared/sandbox-regions";
import { command } from "../../../lib/command";

export default command({
	sandbox: false,
	description: "Create an environment for cloud workspaces to start from",
	options: {
		name: string().required().desc("Environment name"),
		repo: string()
			.variadic()
			.required()
			.desc(
				"Repository as owner/name. Repeatable; the first is the one a workspace opens on",
			),
		hooksRepo: string().desc(
			"Repository whose .superset/config.json runs setup (default: the first --repo)",
		),
		scope: string()
			.enum("organization", "personal")
			.desc("Who can use it (default: organization)"),
		region: string().desc(
			"Where its workspaces run, e.g. iad1 or fra1 (default: the region nearest you)",
		),
	},
	run: async ({ ctx, options }) => {
		const organizationId = ctx.config.organizationId;
		if (!organizationId) {
			throw new CLIError("No active organization", "Run: superset auth login");
		}
		const region = options.region as SandboxRegionId | undefined;
		if (region && !SANDBOX_REGION_IDS.includes(region)) {
			throw new CLIError(
				`Unknown region ${region}`,
				`Regions: ${SANDBOX_REGION_IDS.join(", ")}`,
			);
		}
		const connected = await ctx.api.integration.github.listRepositories.query({
			organizationId,
		});
		const repositoryId = (fullName: string) => {
			const match = connected.find(
				(repo) => repo.fullName.toLowerCase() === fullName.toLowerCase(),
			);
			if (!match) {
				throw new CLIError(
					`${fullName} is not connected to this organization`,
					"See what is connected with: superset environments repos",
				);
			}
			return match.id;
		};
		const repositoryIds = (options.repo as string[]).map(repositoryId);
		const created = await ctx.api.environment.create.mutate({
			organizationId,
			name: options.name,
			repositoryIds,
			hooksRepositoryId: options.hooksRepo
				? repositoryId(options.hooksRepo)
				: repositoryIds[0],
			scope: options.scope,
			region,
		});
		const environment = await ctx.api.environment.get.query({
			id: created.id,
		});
		return {
			data: environment,
			message: `Created ${environment.name} (${environment.id}) in ${environment.region}`,
		};
	},
});
