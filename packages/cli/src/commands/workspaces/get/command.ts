import { CLIError, positional, string } from "@superset/cli-framework";
import { command } from "../../../lib/command";
import { findHostWorkspace } from "../../../lib/host-workspaces";

export default command({
	description: "Show details for a single workspace by id",
	args: [
		positional("id").desc("Workspace ID (defaults to $SUPERSET_WORKSPACE_ID)"),
	],
	options: {
		field: string()
			.alias("f")
			.desc(
				"Print a single field's raw value (e.g. name, branch, worktreePath)",
			),
	},
	run: async ({ ctx, args, options }) => {
		const id =
			(args.id as string | undefined) ?? process.env.SUPERSET_WORKSPACE_ID;
		if (!id) {
			throw new CLIError(
				"No workspace id",
				"Pass an id or run inside a workspace where $SUPERSET_WORKSPACE_ID is set",
			);
		}

		const organizationId = ctx.config.organizationId;
		if (!organizationId) {
			throw new CLIError("No active organization", "Run: superset auth login");
		}

		// Workspace records are host-owned: resolve the id across the org's
		// reachable hosts, then enrich project/host ids with cloud names.
		const [{ workspace, warnings }, projects, hosts] = await Promise.all([
			findHostWorkspace(
				{ api: ctx.api, organizationId, userJwt: ctx.bearer },
				id,
			),
			ctx.api.v2Project.list
				.query({ organizationId })
				.catch(() => [] as Array<{ id: string; name: string }>),
			ctx.api.host.list
				.query({ organizationId })
				.catch(() => [] as Array<{ id: string; name: string }>),
		]);
		for (const warning of warnings) {
			process.stderr.write(`Warning: ${warning}\n`);
		}
		if (!workspace) {
			throw new CLIError(
				`Workspace not found on any reachable host: ${id}`,
				"List workspaces with: superset workspaces list",
			);
		}

		const projectName =
			projects.find((project) => project.id === workspace.projectId)?.name ??
			workspace.projectId;
		const hostName =
			hosts.find((host) => host.id === workspace.hostId)?.name ??
			workspace.hostId;

		const detail = {
			id: workspace.id,
			name: workspace.name,
			branch: workspace.branch,
			type: workspace.type,
			projectId: workspace.projectId,
			projectName,
			hostId: workspace.hostId,
			hostName,
			taskId: workspace.taskId,
			worktreePath: workspace.worktreePath,
			worktreeExists: workspace.worktreeExists,
			createdAt: workspace.createdAt,
		};

		if (options.field) {
			if (!Object.hasOwn(detail, options.field)) {
				throw new CLIError(
					`Unknown field: ${options.field}`,
					`Available fields: ${Object.keys(detail).join(", ")}`,
				);
			}
			const value = detail[options.field as keyof typeof detail];
			return {
				data: detail,
				message: value === null || value === undefined ? "" : String(value),
			};
		}

		const width = Math.max(...Object.keys(detail).map((key) => key.length));
		const message = Object.entries(detail)
			.map(([key, value]) => {
				const shown = value === null || value === undefined ? "—" : value;
				return `${key.padEnd(width)}  ${shown}`;
			})
			.join("\n");

		return { data: detail, message };
	},
});
