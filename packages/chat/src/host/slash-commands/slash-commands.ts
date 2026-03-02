import { buildSlashCommandRegistry } from "./registry";
import type { SlashCommand } from "./types";

/**
 * Scan Markdown files under `.claude/*` and `.agents/*` command directories for custom slash commands.
 * Project-local commands (under `cwd`) take priority over user-global ones.
 */
export function getSlashCommands(cwd: string): SlashCommand[] {
	return buildSlashCommandRegistry(cwd).map((command) => ({
		name: command.name,
		aliases: command.aliases,
		description: command.description,
		argumentHint: command.argumentHint,
		kind: command.kind,
		source: command.source,
		action: command.action,
	}));
}
