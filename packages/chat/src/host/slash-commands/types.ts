export type SlashCommandKind = "custom" | "builtin";
export type SlashCommandActionType =
	| "new_session"
	| "set_model"
	| "stop_stream";

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
	action?: SlashCommandActionDefinition;
}

export type SlashCommandSource = "project" | "global" | "builtin";

export interface SlashCommandRegistryEntry extends SlashCommand {
	filePath?: string;
	template?: string;
}
