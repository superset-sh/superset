import type { Command, CommandContext, CommandSection } from "./types";

function findInCommands(
	commands: Command[],
	commandId: string,
	context: CommandContext,
): Command | null {
	for (const command of commands) {
		if (command.when && !command.when(context)) continue;
		if (command.id === commandId) return command;
		if (!command.children) continue;
		const children =
			typeof command.children === "function"
				? command.children(context)
				: command.children;
		const match = findInCommands(children, commandId, context);
		if (match) return match;
	}
	return null;
}

export function findCommandById(
	sections: CommandSection[],
	commandId: string,
	context: CommandContext,
): Command | null {
	for (const section of sections) {
		const match = findInCommands(section.commands, commandId, context);
		if (match) return match;
	}
	return null;
}
