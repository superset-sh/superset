import { boolean, CLIError, string, table } from "@superset/cli-framework";
import { command } from "../../../lib/command";
import { resolveHostFilter, resolveHostTarget } from "../../../lib/host-target";

export default command({
	description: "List projects in the active organization",
	display: (data) =>
		table(
			data as Record<string, unknown>[],
			["name", "slug", "repoCloneUrl", "setUp", "path", "id"],
			["NAME", "SLUG", "REPO", "SET UP", "PATH", "ID"],
		),
	options: {
		host: string().desc("Show setup status for a specific host machineId"),
		local: boolean().desc("Show setup status for this machine"),
	},
	run: async ({ ctx, options }) => {
		const organizationId = ctx.config.organizationId;
		if (!organizationId) {
			throw new CLIError("No active organization", "Run: superset auth login");
		}

		const projects = await ctx.api.v2Project.list.query({ organizationId });
		const hostId = resolveHostFilter({
			host: options.host ?? undefined,
			local: options.local ?? undefined,
		});
		const hostExplicit = options.host !== undefined || options.local === true;

		let hostProjectById: Map<string, { id: string; repoPath: string }> | null =
			null;
		try {
			const target = resolveHostTarget({
				requestedHostId: hostId,
				organizationId,
				userJwt: ctx.bearer,
			});
			const hostProjects = await target.client.project.list.query();
			hostProjectById = new Map(
				hostProjects.map((project) => [project.id, project]),
			);
		} catch (err) {
			if (hostExplicit) throw err;
		}

		return projects.map((project) => {
			if (!hostProjectById) {
				return { ...project, setUp: "?", path: "-" };
			}
			const hostProject = hostProjectById.get(project.id);
			return {
				...project,
				setUp: hostProject ? "yes" : "no",
				path: hostProject?.repoPath ?? "-",
			};
		});
	},
});
