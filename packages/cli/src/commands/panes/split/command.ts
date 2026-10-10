import { CLIError, string } from "@superset/cli-framework";
import { command } from "../../../lib/command";
import {
	callPanes,
	directionOption,
	layoutResult,
	resolvePanesClient,
	workspaceOptions,
} from "../shared";

export default command({
	description:
		"Split a pane and show a terminal in the new pane. Creates a terminal unless --terminal is set",
	options: {
		...workspaceOptions,
		pane: string().required().desc("Pane to split"),
		direction: directionOption().required(),
		terminal: string().desc(
			"Existing terminal session to show in the new pane",
		),
		command: string().desc("Command to run in the new terminal"),
	},
	run: async ({ ctx, options }) => {
		if (options.terminal && options.command) {
			throw new CLIError(
				"--command only applies to a new terminal",
				"Drop --terminal to create one, or drop --command",
			);
		}
		const client = await resolvePanesClient(ctx, options);
		const workspaceId = options.workspace;
		const terminalId =
			options.terminal ??
			(
				await client.terminal.createSession.mutate({
					workspaceId,
					initialCommand: options.command ?? undefined,
				})
			).terminalId;

		try {
			const result = await callPanes(() =>
				client.panes.split.mutate({
					workspaceId,
					paneId: options.pane,
					direction: options.direction,
					terminalId,
				}),
			);
			return layoutResult(
				`Split ${options.pane} ${options.direction}: pane ${result.paneId}, terminal ${terminalId}`,
				{ ...result, terminalId },
			);
		} catch (error) {
			if (!options.terminal) {
				await client.terminal.killSession
					.mutate({ workspaceId, terminalId })
					.catch(() => {});
			}
			throw error;
		}
	},
});
