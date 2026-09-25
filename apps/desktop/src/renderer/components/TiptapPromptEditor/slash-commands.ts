import type { SlashCommand as SharedSlashCommand } from "@superset/shared/slash-commands";

export type {
	SlashCommandEntryKind,
	SlashCommandIdentity,
	SlashCommandKind,
	SlashCommandSource,
	SlashCommandTrigger,
} from "@superset/shared/slash-commands";
export {
	findSlashCommandByNameOrAlias,
	getCommandMatchRank,
	shouldSuppressSlashMenuForCommittedCommand,
	sortSlashCommandMatches,
} from "@superset/shared/slash-commands";

export interface ModelOption {
	id: string;
	name: string;
	provider: string;
}

export type SlashCommandActionType =
	| "new_session"
	| "set_model"
	| "stop_stream"
	| "show_mcp_overview";

export interface SlashCommandActionDefinition {
	type: SlashCommandActionType;
	passArguments?: boolean;
}

/**
 * The shared wire shape plus the renderer-only `action` hook, which maps a
 * committed command onto an app behavior instead of a prompt.
 */
export interface SlashCommand extends SharedSlashCommand {
	action?: SlashCommandActionDefinition;
}
