import { boolean, CLIError, positional, string } from "@superset/cli-framework";
import { command } from "../../../lib/command";
import {
	openUrl,
	sessionDeepLink,
	workspaceDeepLink,
} from "../../../lib/deep-link";

export default command({
	description: "Open a workspace in the Superset desktop app",
	args: [positional("id").required().desc("Workspace ID")],
	options: {
		print: boolean().desc(
			"Print the deep link URL instead of opening the desktop app",
		),
		chatSession: string().desc(
			"Open and focus a chat session (Superset agent) by id",
		),
		terminalSession: string().desc(
			"Open and focus a terminal session (claude, codex, …) by id",
		),
	},
	run: async ({ ctx, args, options }) => {
		const id = args.id as string;
		const organizationId = ctx.config.organizationId;
		if (!organizationId) {
			throw new CLIError("No active organization", "Run: superset auth login");
		}

		if (options.chatSession && options.terminalSession) {
			throw new CLIError(
				"Pass only one of --chat-session or --terminal-session",
			);
		}

		const workspace = await ctx.api.v2Workspace.getFromHost.query({
			organizationId,
			id,
		});
		if (!workspace) {
			throw new CLIError(
				`Workspace not found: ${id}`,
				"List workspaces with: superset workspaces list",
			);
		}

		const url = options.chatSession
			? sessionDeepLink(workspace.id, "chat", options.chatSession)
			: options.terminalSession
				? sessionDeepLink(workspace.id, "terminal", options.terminalSession)
				: workspaceDeepLink(workspace.id);

		if (!options.print) {
			try {
				await openUrl(url);
			} catch (err) {
				throw new CLIError(
					"Failed to open desktop app",
					err instanceof Error ? err.message : String(err),
				);
			}
		}

		return {
			data: { id: workspace.id, name: workspace.name, url },
			message: options.print
				? url
				: `Opening "${workspace.name}" in Superset desktop`,
		};
	},
});
