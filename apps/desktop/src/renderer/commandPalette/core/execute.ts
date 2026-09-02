import { msg } from "@lingui/core/macro";
import { i18n } from "@superset/i18n";
import { errorMessage } from "@superset/i18n/errors";
import { toast } from "@superset/ui/sonner";
import { track } from "renderer/lib/analytics";
import type { Command, CommandContext } from "./types";

export async function executeCommand(
	command: Command,
	context: CommandContext,
): Promise<void> {
	track("command_run", { commandId: command.id, section: command.section });
	if (!command.run) return;
	try {
		await command.run(context);
	} catch (error) {
		const message = errorMessage(error);
		toast.error(
			i18n._({
				...msg({
					message: 'Command "{title}" failed: {message}',
				}),
				values: { title: i18n._(command.title), message },
			}),
		);
	}
}
