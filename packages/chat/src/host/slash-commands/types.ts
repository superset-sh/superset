export type SlashCommandKind = "custom" | "builtin";

export interface SlashCommand {
	name: string;
	description: string;
	argumentHint: string;
	kind: SlashCommandKind;
	source: SlashCommandSource;
}

export type SlashCommandSource = "project" | "global" | "builtin";

export interface SlashCommandRegistryEntry extends SlashCommand {
	filePath?: string;
	template?: string;
}
