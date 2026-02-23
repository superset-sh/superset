export type SlashCommandKind = "custom";

export interface SlashCommand {
	name: string;
	description: string;
	argumentHint: string;
	kind: SlashCommandKind;
	source: SlashCommandSource;
}

export type SlashCommandSource = "project" | "global";

export interface SlashCommandRegistryEntry extends SlashCommand {
	filePath: string;
}
