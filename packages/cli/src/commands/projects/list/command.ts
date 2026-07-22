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

		type HostProject = {
			id: string;
			name: string;
			repoPath: string;
			repoUrl: string | null;
		};
		let hostProjectById: Map<string, HostProject> | null = null;
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

		const cloudRows = projects.map((project) => {
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

		if (!hostProjectById) return cloudRows;

		// Local-first projects (created via `projects create --local`) live only
		// in the host DB — the cloud never learns about them. Surface any host
		// project the cloud list didn't already cover so `list` matches what the
		// desktop UI shows instead of printing "No results." after a create.
		const cloudIds = new Set(projects.map((project) => project.id));
		const hostOnlyRows = [...hostProjectById.values()]
			.filter((hostProject) => !cloudIds.has(hostProject.id))
			.map((hostProject) => ({
				id: hostProject.id,
				name: hostProject.name,
				slug: null,
				repoCloneUrl: hostProject.repoUrl ?? null,
				setUp: "yes",
				path: hostProject.repoPath,
			}));

		return [...cloudRows, ...hostOnlyRows];
	},
});
