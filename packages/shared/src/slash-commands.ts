/**
 * The wire type for agent slash commands and skills, shared by every producer
 * and every composer.
 *
 * Two producers emit it: the host-service filesystem scanner
 * (packages/host-service/src/agent-tooling/) for PTY terminal sessions, and —
 * later — the chat harness adapters mapping what the agent SDK reports
 * (Claude's `supportedCommands()` / `commands_changed`) into
 * `SessionState.availableCommands`. Keeping the type here, runtime-neutral,
 * is what lets the terminal and chat composers share one menu contract.
 */

/** Which composer sigil commits this entry — Codex invokes skills as `$name`. */
export type SlashCommandTrigger = "/" | "$";

/** What the entry is. Orthogonal to `kind`: a plugin skill is custom+skill. */
export type SlashCommandEntryKind = "command" | "skill";

/**
 * Provenance axis the sorter orders on: harness-shipped builtins sort after
 * user-defined commands.
 */
export type SlashCommandKind = "custom" | "builtin";

/**
 * Where the definition came from. `plugin` is a Claude installed plugin;
 * `harness` is reported by the agent SDK itself (chat sessions), where file
 * provenance is opaque; `builtin` ships with the harness or composer.
 */
export type SlashCommandSource =
	| "project"
	| "global"
	| "plugin"
	| "harness"
	| "builtin";

export interface SlashCommandIdentity {
	name: string;
	aliases: string[];
}

export interface SlashCommand extends SlashCommandIdentity {
	description: string;
	/** Empty when the command takes no arguments. */
	argumentHint: string;
	kind: SlashCommandKind;
	source: SlashCommandSource;
	entryKind: SlashCommandEntryKind;
	trigger: SlashCommandTrigger;
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

export function getCommandMatchRank<T extends SlashCommandIdentity>(
	command: T,
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

export function shouldSuppressSlashMenuForCommittedCommand<
	T extends SlashCommandIdentity & { argumentHint: string },
>(query: string | null, commands: T[]): boolean {
	if (!query) return false;
	const exactCommandMatch = findSlashCommandByNameOrAlias(commands, query);
	if (!exactCommandMatch) return false;
	return exactCommandMatch.argumentHint.trim().length > 0;
}

export function sortSlashCommandMatches<
	T extends SlashCommandIdentity & { kind: SlashCommandKind },
>(matches: Array<{ command: T; rank: number }>): T[] {
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
