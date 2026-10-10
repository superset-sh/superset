import { boolean, CLIError, positional, string } from "@superset/cli-framework";
import { command } from "../../../lib/command";
import { resolveHostClient } from "../../../lib/resolve-host-client";

/** Inside a Superset terminal, a click on the notification opens that terminal. */
function clickTarget(options: {
	host?: string | null;
	workspace?: string | null;
	terminal?: string | null;
}) {
	const fromEnv = !options.host;
	const workspaceId =
		options.workspace ??
		(fromEnv ? process.env.SUPERSET_WORKSPACE_ID : undefined);
	const terminalId =
		options.terminal ??
		(fromEnv ? process.env.SUPERSET_TERMINAL_ID : undefined);
	return workspaceId && terminalId ? { workspaceId, terminalId } : undefined;
}

export default command({
	description:
		"Show a desktop notification; clicking it opens the terminal that sent it",
	args: [positional("title").required().desc("Notification title")],
	options: {
		body: string().desc("Text under the title"),
		sound: boolean().desc("Play the notification sound set in the app"),
		workspace: string().desc(
			"Workspace to open on click (default: the calling terminal's)",
		),
		terminal: string().desc(
			"Terminal to open on click (default: the calling terminal)",
		),
		host: string().desc(
			"Host whose desktop app shows it (default: this machine)",
		),
	},
	run: async ({ ctx, args, options }) => {
		const client = await resolveHostClient(ctx, options);
		const target = clickTarget(options);
		const result = await client.notifications.show
			.mutate({
				title: args.title as string,
				body: options.body ?? undefined,
				sound: options.sound ?? false,
				target,
			})
			.catch((error: unknown) => {
				if (
					error instanceof Error &&
					/No procedure found on path "?notifications\.show/.test(error.message)
				) {
					throw new CLIError(
						"This host is too old for `superset notifications show`",
						"Update the Superset desktop app on that host",
					);
				}
				throw error;
			});
		if (!result.shown) {
			throw new CLIError(
				"The desktop app could not show a notification",
				"Notifications are not supported or are turned off for Superset in system settings",
			);
		}
		return {
			data: { ...result, target: target ?? null },
			message: "Notification shown",
		};
	},
});
