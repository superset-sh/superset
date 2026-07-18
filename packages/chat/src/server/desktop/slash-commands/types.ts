export type SlashCommandKind = "custom" | "builtin";
export type SlashCommandActionType =
	| "new_session"
	| "set_model"
	| "stop_stream"
	| "show_mcp_overview";

export interface SlashCommandActionDefinition {
	type: SlashCommandActionType;
	passArguments?: boolean;
}

export interface SlashCommand {
	name: string;
	aliases: string[];
	description: string;
	argumentHint: string;
	kind: SlashCommandKind;
	source: SlashCommandSource;
	/** How a custom entry was discovered; absent for builtins. */
	origin?: "command" | "skill";
	action?: SlashCommandActionDefinition;
}

export type SlashCommandSource = "project" | "global" | "builtin";

export interface SlashCommandRegistryEntry extends SlashCommand {
	filePath?: string;
	template?: string;
}
