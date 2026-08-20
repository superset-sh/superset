import { boolean, CLIError, positional, string } from "@superset/cli-framework";
import { getHostId } from "@superset/shared/host-info";
import { command } from "../../../lib/command";
import { resolveHostTarget } from "../../../lib/host-target";

export default command({
	description: "Update a workspace on a host (default: this machine)",
	args: [positional("id").required().desc("Workspace UUID")],
	options: {
		host: string().desc("Host the workspace lives on (default: this machine)"),
		name: string().desc("Workspace name"),
		taskId: string().desc("Link the workspace to a task by id"),
		clearTask: boolean().desc("Unlink the workspace from its current task"),
		tag: string()
			.variadic()
			.desc(
				"Replace the workspace's tags with this set. Repeatable; tags are normalized (trimmed, lowercased). Tag-bound sidebar groups derive membership from tags",
			),
		clearTags: boolean().desc("Remove all tags from the workspace"),
		parent: string().desc(
			"Re-parent the workspace under another workspace (lineage only — never affects the git base branch)",
		),
		noParent: boolean().desc(
			"Detach the workspace from its parent, moving it to the top level",
		),
	},
	run: async ({ ctx, args, options }) => {
		const id = args.id as string;
		const organizationId = ctx.config.organizationId;
		if (!organizationId) {
			throw new CLIError("No active organization", "Run: superset auth login");
		}

		if (options.taskId !== undefined && options.clearTask) {
			throw new CLIError(
				"Cannot combine --task-id and --clear-task",
				"Pass one or the other",
			);
		}

		const taskId = options.clearTask
			? null
			: options.taskId !== undefined
				? options.taskId
				: undefined;

		if (options.tag && options.tag.length > 0 && options.clearTags) {
			throw new CLIError(
				"Cannot combine --tag and --clear-tags",
				"Pass one or the other",
			);
		}
		const tags = options.clearTags
			? []
			: options.tag && options.tag.length > 0
				? options.tag
				: undefined;

		if (options.parent !== undefined && options.noParent) {
			throw new CLIError(
				"Cannot combine --parent and --no-parent",
				"Pass one or the other",
			);
		}

		// Explicit null detaches; leaving both flags off never touches lineage.
		const parentWorkspaceId = options.noParent
			? null
			: options.parent !== undefined
				? options.parent
				: undefined;

		if (
			options.name === undefined &&
			taskId === undefined &&
			tags === undefined &&
			parentWorkspaceId === undefined
		) {
			throw new CLIError(
				"No fields to update",
				"Pass --name, --task-id, --clear-task, --tag, --clear-tags, --parent, or --no-parent",
			);
		}

		const target = await resolveHostTarget({
			requestedHostId: options.host ?? getHostId(),
			organizationId,
			userJwt: ctx.bearer,
			api: ctx.api,
		});
		const updated = await target.client.workspace.update.mutate({
			id,
			...(options.name !== undefined ? { name: options.name } : {}),
			...(taskId !== undefined ? { taskId } : {}),
			...(tags !== undefined ? { tags } : {}),
			...(parentWorkspaceId !== undefined ? { parentWorkspaceId } : {}),
		});

		return {
			data: updated,
			message: `Updated workspace ${id}`,
		};
	},
});
