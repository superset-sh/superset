import { boolean, CLIError, positional, string } from "@superset/cli-framework";
import { command } from "../../../lib/command";
import {
	applyWorkspaceLaneMove,
	requireSingleMoveTarget,
	resolveByIdOrName,
	toMoveTarget,
} from "../../../lib/host-sections";
import { resolveHostFilter, resolveHostTarget } from "../../../lib/host-target";
import { listWorkspacesOnHost } from "../../../lib/host-workspaces";

export default command({
	description:
		"Move a workspace within its sidebar list (its group, or the project's top level)",
	args: [positional("id").required().desc("Workspace UUID")],
	options: {
		up: boolean().desc("Move one position up"),
		down: boolean().desc("Move one position down"),
		top: boolean().desc("Move to the top"),
		bottom: boolean().desc("Move to the bottom"),
		after: string().desc("Place directly under this workspace (name or id)"),
		host: string().desc("Host the workspace lives on"),
		local: boolean().desc("Target this machine (the default)"),
	},
	run: async ({ ctx, args, options }) => {
		const id = args.id as string;
		const organizationId = ctx.config.organizationId;
		if (!organizationId) {
			throw new CLIError("No active organization", "Run: superset auth login");
		}
		requireSingleMoveTarget(toMoveTarget(options, options.after ?? undefined));

		const {
			hostId,
			workspaces: hostWorkspaces,
			sections: hostSections,
		} = await listWorkspacesOnHost({
			organizationId,
			userJwt: ctx.bearer,
			hostId: resolveHostFilter({
				host: options.host ?? undefined,
				local: options.local ?? undefined,
			}),
		});
		const workspace = hostWorkspaces.find((row) => row.id === id);
		if (!workspace) {
			throw new CLIError(
				`Workspace not found on host ${hostId}: ${id}`,
				"Pass --host <id> if it lives on another machine. List with: superset workspaces list",
			);
		}

		const target = resolveHostTarget({
			requestedHostId: hostId,
			organizationId,
			userJwt: ctx.bearer,
		});

		const sectionId = workspace.sectionId ?? null;
		let afterId: string | undefined;
		if (options.after) {
			// Resolve `--after` within the workspace's own list.
			const candidates = hostWorkspaces.filter((row) =>
				sectionId
					? row.sectionId === sectionId
					: !row.sectionId && row.projectId === workspace.projectId,
			);
			afterId = resolveByIdOrName(candidates, options.after, {
				entity: "--after workspace",
				notFoundHint: "It must be in the same list as the workspace",
				ambiguousHint: "Pass the workspace id instead",
			}).id;
		}

		await applyWorkspaceLaneMove(
			target.client,
			{ workspaces: hostWorkspaces, sections: hostSections },
			{
				workspaceId: id,
				sectionId,
				projectId: workspace.projectId,
				target: toMoveTarget(options, afterId),
			},
		);

		return {
			data: { id },
			message: `Moved workspace "${workspace.name}"`,
		};
	},
});
