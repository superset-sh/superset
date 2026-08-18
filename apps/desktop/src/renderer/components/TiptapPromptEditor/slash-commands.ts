export interface ModelOption {
	id: string;
	name: string;
	provider: string;
}

export type SlashCommandKind = "custom" | "builtin";
export type SlashCommandSource = "project" | "global" | "builtin";

export type SlashCommandActionType =
	| "new_session"
	| "set_model"
	| "stop_stream"
	| "show_mcp_overview";

export interface SlashCommandActionDefinition {
	type: SlashCommandActionType;
	passArguments?: boolean;
}

export interface SlashCommandIdentity {
	name: string;
	aliases: string[];
}

export interface SlashCommand extends SlashCommandIdentity {
	description: string;
	argumentHint: string;
	kind: SlashCommandKind;
	source: SlashCommandSource;
	action?: SlashCommandActionDefinition;
}

function normalizeSlashCommandName(name: string): string {
	return name.trim().toLowerCase();
}

export function findSlashCommandByNameOrAlias<T extends SlashCommandIdentity>(
	commands: T[],
	nameOrAlias: string,
): T | null {
	const target = normalizeSlashCommandName(nameOrAlias);
	if (!target) return null;
	return (
		commands.find(
			(command) =>
				normalizeSlashCommandName(command.name) === target ||
				command.aliases.some(
					(alias) => normalizeSlashCommandName(alias) === target,
				),
		) ?? null
	);
}

function getMatchRank(commandName: string, query: string): number | null {
	if (query === "") return 0;
	if (commandName === query) return 0;
	if (commandName.startsWith(query)) return 1;
	if (commandName.includes(query)) return 2;
	return null;
}

export function getCommandMatchRank(
	command: SlashCommand,
	query: string,
): number | null {
	const nameRank = getMatchRank(command.name.toLowerCase(), query);
	if (nameRank !== null) return nameRank;

	let bestAliasRank: number | null = null;
	for (const alias of command.aliases) {
		const rank = getMatchRank(alias.toLowerCase(), query);
		if (rank === null) continue;
		const aliasRank = rank + 3;
		if (bestAliasRank === null || aliasRank < bestAliasRank) {
			bestAliasRank = aliasRank;
		}
	}

	return bestAliasRank;
}

export function shouldSuppressSlashMenuForCommittedCommand(
	query: string | null,
	commands: SlashCommand[],
): boolean {
	if (!query) return false;
	const exactCommandMatch = findSlashCommandByNameOrAlias(commands, query);
	if (!exactCommandMatch) return false;
	return exactCommandMatch.argumentHint.trim().length > 0;
}

export function sortSlashCommandMatches(
	matches: Array<{ command: SlashCommand; rank: number }>,
): SlashCommand[] {
	return matches
		.sort((a, b) => {
			if (a.command.kind !== b.command.kind) {
				return a.command.kind === "builtin" ? 1 : -1;
			}
			if (a.rank !== b.rank) return a.rank - b.rank;
			return a.command.name.localeCompare(b.command.name);
		})
		.map((item) => item.command);
}
