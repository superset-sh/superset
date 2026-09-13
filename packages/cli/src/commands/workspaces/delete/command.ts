import { boolean, CLIError, positional, string } from "@superset/cli-framework";
import { getHostId } from "@superset/shared/host-info";
import { command } from "../../../lib/command";
import { resolveHostFilter, resolveHostTarget } from "../../../lib/host-target";

export default command({
	description:
		"Delete workspaces by ID on a host (default: this machine), or cloud sandboxes with --cloud",
	args: [positional("ids").required().variadic().desc("Workspace IDs")],
	options: {
		host: string().desc("Host the workspaces live on"),
		local: boolean().desc("Target this machine (the default)"),
		cloud: boolean().desc(
			"Delete cloud sandboxes — tears down the sandbox, which is what stops it billing",
		),
		"delete-branch": boolean().desc(
			"Delete the workspace's git branch after delete (default: the branch is kept, matching the desktop UI)",
		),
	},
	run: async ({ ctx, args, options }) => {
		const ids = args.ids as string[];
		const organizationId = ctx.config.organizationId;
		if (!organizationId) {
			throw new CLIError("No active organization", "Run: superset auth login");
		}

		if (options.cloud) {
			if (options.host !== undefined || options.local) {
				throw new CLIError(
					"--cloud cannot be combined with --host or --local",
					"Cloud sandboxes are not hosted on one of your machines",
				);
			}
			const deleted: string[] = [];
			const missing: string[] = [];
			for (const id of ids) {
				const result = await ctx.api.cloudWorkspace.delete.mutate({ id });
				(result.deleted ? deleted : missing).push(id);
			}
			const summary =
				deleted.length === 1
					? `Deleted cloud workspace ${deleted[0]}`
					: `Deleted ${deleted.length} cloud workspaces`;
			return {
				data: { deleted, missing },
				message:
					missing.length > 0
						? `${summary}\nNot found: ${missing.join(", ")}`
						: summary,
			};
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
		const warnings: string[] = [];
		for (const id of ids) {
			const result = await target.client.workspace.delete.mutate({
				id,
				deleteBranch: options["delete-branch"] === true,
			});
			deleted.push(id);
			for (const warning of result.warnings ?? []) {
				warnings.push(`${id}: ${warning}`);
			}
		}

		const deleteMessage =
			deleted.length === 1
				? `Deleted workspace ${deleted[0]}`
				: `Deleted ${deleted.length} workspaces`;
		return {
			data: { deleted, warnings },
			message:
				warnings.length > 0
					? `${deleteMessage}\nWarnings:\n${warnings.map((warning) => `- ${warning}`).join("\n")}`
					: deleteMessage,
		};
	},
});
