import { buildSlashCommandRegistry } from "./registry";
import type { SlashCommand } from "./types";

/**
 * Scan Markdown files under `.claude/commands` and `.claude/command` for custom slash commands.
 * Project-local commands (under `cwd`) take priority over user-global ones.
 */
export function getSlashCommands(cwd: string): SlashCommand[] {
	return buildSlashCommandRegistry(cwd).map((command) => ({
		name: command.name,
		description: command.description,
		argumentHint: command.argumentHint,
		kind: command.kind,
		source: command.source,
	}));
}
