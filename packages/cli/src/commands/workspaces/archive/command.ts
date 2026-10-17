import { boolean, CLIError, positional, string } from "@superset/cli-framework";
import { resolveWorkspaceHost } from "../../../lib/cloud-workspaces";
import { command } from "../../../lib/command";
import { resolveHostTarget } from "../../../lib/host-target";

export default command({
	description:
		"Archive workspaces by ID: cloud workspaces by default if your account has them, else on this machine; --local or --host picks a host. A cloud sandbox stops within a minute and is deleted after 7 days; a restore before then keeps its disk. On a host, a worktree's folder is removed with any uncommitted changes; its branch stays unless --delete-branch, so a restore brings back only committed work",
	aliases: ["delete"],
	args: [positional("ids").required().variadic().desc("Workspace IDs")],
	options: {
		host: string().desc("Host the workspaces live on"),
		local: boolean().desc("The workspaces are on this machine"),
		deleteBranch: boolean().desc(
			"Also delete each workspace's local branch (git branch -D, so unpushed commits are lost); host workspaces only",
		),
	},
	run: async ({ ctx, args, options }) => {
		const ids = args.ids as string[];
		const deleteBranch = options.deleteBranch ?? false;
		const organizationId = ctx.config.organizationId;
		if (!organizationId) {
			throw new CLIError("No active organization", "Run: superset auth login");
		}

		const hostId = await resolveWorkspaceHost(
			{ host: options.host, local: options.local },
			ctx.api,
			organizationId,
		);
		if (!hostId) {
			// The cloud delete has no branch contract: refuse rather than report a
			// branch deletion that never happened.
			if (deleteBranch) {
				throw new CLIError(
					"--delete-branch only applies to workspaces on a host",
					"Pass --local or --host <id> if the workspaces live on a machine",
				);
			}
			const archived: string[] = [];
			const missing: string[] = [];
			for (const id of ids) {
				const result = await ctx.api.cloudWorkspace.delete.mutate({ id });
				(result.deleted ? archived : missing).push(id);
			}
			if (missing.length > 0) {
				const alsoArchived =
					archived.length > 0 ? ` (archived: ${archived.join(", ")})` : "";
				throw new CLIError(
					`No cloud workspace in this organization: ${missing.join(", ")}${alsoArchived}`,
					"Pass --local or --host <id> if it lives on a machine",
				);
			}
			return {
				data: { deleted: archived },
				message:
					archived.length === 1
						? `Archived cloud workspace ${archived[0]}`
						: `Archived ${archived.length} cloud workspaces`,
			};
		}

		const target = await resolveHostTarget({
			requestedHostId: hostId,
			organizationId,
			userJwt: ctx.bearer,
			api: ctx.api,
		});

		const archived: string[] = [];
		const branchesDeleted: string[] = [];
		const warnings: string[] = [];
		for (const id of ids) {
			const result = await target.client.workspace.delete.mutate({
				id,
				deleteBranch,
			});
			archived.push(id);
			if (result.branchDeleted) branchesDeleted.push(id);
			for (const warning of result.warnings ?? []) {
				warnings.push(`${id}: ${warning}`);
			}
		}

		const archivedSummary =
			archived.length === 1
				? `Archived workspace ${archived[0]}`
				: `Archived ${archived.length} workspaces`;
		// Without --delete-branch nothing touched the branches, and a
		// "0 branches deleted" note would read as a failure.
		const archiveMessage = deleteBranch
			? `${archivedSummary} (${formatBranchNote(branchesDeleted.length, archived.length)})`
			: archivedSummary;
		return {
			data: { deleted: archived, branchesDeleted, warnings },
			message:
				warnings.length > 0
					? `${archiveMessage}\nWarnings:\n${warnings.map((warning) => `- ${warning}`).join("\n")}`
					: archiveMessage,
		};
	},
});

/** One workspace has exactly one branch, so say what happened to it; a ratio
 *  only helps across several. */
function formatBranchNote(
	branchesDeleted: number,
	workspacesArchived: number,
): string {
	if (workspacesArchived === 1) {
		return branchesDeleted === 1 ? "branch deleted" : "branch not deleted";
	}
	return `${branchesDeleted}/${workspacesArchived} branches deleted`;
}
