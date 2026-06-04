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
		const message = error instanceof Error ? error.message : String(error);
		toast.error(`Command "${command.title}" failed: ${message}`);
	}
}
