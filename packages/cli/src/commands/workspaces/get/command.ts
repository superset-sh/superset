import { boolean, CLIError, positional, string } from "@superset/cli-framework";
import { resolveWorkspaceHost } from "../../../lib/cloud-workspaces";
import { command } from "../../../lib/command";
import { resolveWorkspaceTarget } from "../../../lib/host-workspaces";

export default command({
	description: "Show details for a single workspace by id",
	args: [
		positional("id").desc("Workspace ID (defaults to $SUPERSET_WORKSPACE_ID)"),
	],
	options: {
		host: string().desc(
			"Host the workspace lives on (default: the cloud if your account has cloud workspaces, else this machine)",
		),
		local: boolean().desc("The workspace is on this machine"),
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

		const hostId = await resolveWorkspaceHost(
			{ host: options.host, local: options.local },
			ctx.api,
			organizationId,
		);
		const detail = hostId
			? await hostDetail(ctx, organizationId, id, hostId)
			: await cloudDetail(ctx, organizationId, id);

		if (options.field) {
			if (!Object.hasOwn(detail, options.field)) {
				throw new CLIError(
					`Unknown field: ${options.field}`,
					`Available fields: ${Object.keys(detail).join(", ")}`,
				);
			}
			const value = (detail as Record<string, unknown>)[options.field];
			return {
				data: detail,
				message:
					value === null || value === undefined
						? ""
						: Array.isArray(value)
							? JSON.stringify(value)
							: String(value),
			};
		}

		const width = Math.max(...Object.keys(detail).map((key) => key.length));
		const message = Object.entries(detail)
			.map(([key, value]) => {
				if (key === "repos") {
					const repos = value as HostDetail["repos"];
					const lines = repos.map(
						(repo) =>
							`${" ".repeat(width + 2)}${repo.folder}  ${repo.repository ?? "—"}  ${repo.branch}  (base ${repo.base ?? "—"})  ${repo.path}`,
					);
					return [`${key.padEnd(width)}  ${repos.length}`, ...lines].join("\n");
				}
				const shown = value === null || value === undefined ? "—" : value;
				return `${key.padEnd(width)}  ${shown}`;
			})
			.join("\n");

		return { data: detail, message };
	},
});

type Ctx = Parameters<Parameters<typeof command>[0]["run"]>[0]["ctx"];
type HostDetail = Awaited<ReturnType<typeof hostDetail>>;

/** A cloud workspace's details are the API's row; reading them never wakes its sandbox. */
async function cloudDetail(ctx: Ctx, organizationId: string, id: string) {
	const rows = await ctx.api.cloudWorkspace.list.query({ organizationId });
	const row = rows.find((candidate) => candidate.id === id);
	if (!row) {
		throw new CLIError(
			`No cloud workspace ${id} in this organization`,
			"Pass --local for a workspace on this machine, or --host <id> for another host",
		);
	}
	return {
		id: row.id,
		name: row.name,
		branch: row.branch,
		status: row.status,
		environmentId: row.environmentId,
		createdByUserId: row.createdByUserId,
		createdAt: row.createdAt,
	};
}

/** The row carries its host-served project name; the host id is enriched with its cloud name for display only. */
async function hostDetail(
	ctx: Ctx,
	organizationId: string,
	id: string,
	hostId: string,
) {
	const [{ workspace }, hosts] = await Promise.all([
		resolveWorkspaceTarget(
			{
				organizationId,
				userJwt: ctx.bearer,
				api: ctx.api,
				host: hostId,
			},
			id,
		),
		ctx.api.host.list
			.query({ organizationId })
			.catch(() => [] as Array<{ id: string; name: string }>),
	]);
	return {
		id: workspace.id,
		name: workspace.name,
		branch: workspace.branch,
		type: workspace.type,
		projectId: workspace.projectId,
		projectName: workspace.projectName ?? workspace.projectId,
		hostId: workspace.hostId,
		hostName:
			hosts.find((host) => host.id === workspace.hostId)?.name ??
			workspace.hostId,
		taskId: workspace.taskId,
		worktreePath: workspace.worktreePath,
		worktreeExists: workspace.worktreeExists,
		repos: workspace.repos ?? [],
		createdAt: workspace.createdAt,
	};
}
