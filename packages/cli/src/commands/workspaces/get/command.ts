import { CLIError, positional, string } from "@superset/cli-framework";
import { command } from "../../../lib/command";
import { findWorkspaceOnHost } from "../../../lib/host-workspaces";

export default command({
	description: "Show details for a single workspace by id",
	args: [
		positional("id").desc("Workspace ID (defaults to $SUPERSET_WORKSPACE_ID)"),
	],
	options: {
		host: string().desc("Host the workspace lives on (default: this machine)"),
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

		// The row carries its host-served project name; the host id is
		// enriched with its cloud name for display only.
		const [{ hostId, workspace }, hosts] = await Promise.all([
			findWorkspaceOnHost(
				{
					organizationId,
					userJwt: ctx.bearer,
					hostId: options.host ?? undefined,
				},
				id,
			),
			ctx.api.host.list
				.query({ organizationId })
				.catch(() => [] as Array<{ id: string; name: string }>),
		]);
		if (!workspace) {
			throw new CLIError(
				`Workspace not found on host ${hostId}: ${id}`,
				"Pass --host <id> if it lives on another machine. List with: superset workspaces list",
			);
		}

		const projectName = workspace.projectName ?? workspace.projectId;
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
