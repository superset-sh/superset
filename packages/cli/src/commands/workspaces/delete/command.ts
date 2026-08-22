import { boolean, CLIError, positional, string } from "@superset/cli-framework";
import { getHostId } from "@superset/shared/host-info";
import { command } from "../../../lib/command";
import { resolveHostFilter, resolveHostTarget } from "../../../lib/host-target";

export default command({
	description: "Delete workspaces by ID on a host (default: this machine)",
	args: [positional("ids").required().variadic().desc("Workspace IDs")],
	options: {
		host: string().desc("Host the workspaces live on"),
		local: boolean().desc("Target this machine (the default)"),
		deleteBranch: boolean().desc(
			"Also delete each workspace's local branch (git branch -D; kept by default)",
		),
	},
	run: async ({ ctx, args, options }) => {
		const ids = args.ids as string[];
		const deleteBranch = options.deleteBranch ?? false;
		const organizationId = ctx.config.organizationId;
		if (!organizationId) {
			throw new CLIError("No active organization", "Run: superset auth login");
		}

		const hostId =
			resolveHostFilter({
				host: options.host ?? undefined,
				local: options.local ?? undefined,
			}) ?? getHostId();
		const target = await resolveHostTarget({
			requestedHostId: hostId,
			organizationId,
			userJwt: ctx.bearer,
			api: ctx.api,
		});

		const deleted: string[] = [];
		const branchesDeleted: string[] = [];
		const warnings: string[] = [];
		for (const id of ids) {
			const result = await target.client.workspace.delete.mutate({
				id,
				deleteBranch,
			});
			deleted.push(id);
			if (result.branchDeleted) branchesDeleted.push(id);
			for (const warning of result.warnings ?? []) {
				warnings.push(`${id}: ${warning}`);
			}
		}

		const deletedSummary =
			deleted.length === 1
				? `Deleted workspace ${deleted[0]}`
				: `Deleted ${deleted.length} workspaces`;
		// Only annotate branches when asked: without --delete-branch the count
		// is always 0 and would read as a failure.
		const deleteMessage = deleteBranch
			? `${deletedSummary} (${formatBranchNote(branchesDeleted.length, deleted.length)})`
			: deletedSummary;
		return {
			data: { deleted, branchesDeleted, warnings },
			message:
				warnings.length > 0
					? `${deleteMessage}\nWarnings:\n${warnings.map((warning) => `- ${warning}`).join("\n")}`
					: deleteMessage,
		};
	},
});

/** A single workspace has exactly one branch, so the ratio is noise there —
 *  say what happened to it instead. */
function formatBranchNote(
	branchesDeleted: number,
	workspacesDeleted: number,
): string {
	if (workspacesDeleted === 1) {
		return branchesDeleted === 1 ? "branch deleted" : "branch not deleted";
	}
	return `${branchesDeleted}/${workspacesDeleted} branches deleted`;
}
