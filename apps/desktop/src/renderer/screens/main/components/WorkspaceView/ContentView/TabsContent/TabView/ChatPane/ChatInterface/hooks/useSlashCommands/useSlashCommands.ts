import type { ChatServiceRouter } from "@superset/chat/host";
import { findSlashCommandByNameOrAlias } from "@superset/chat/shared";
import type { inferRouterOutputs } from "@trpc/server";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

type ChatServiceOutputs = inferRouterOutputs<ChatServiceRouter>;
export type SlashCommand =
	ChatServiceOutputs["workspace"]["getSlashCommands"][number];

function getSlashQuery(inputValue: string): string | null {
	if (inputValue.includes("\n")) return null;
	const match = inputValue.match(/^\/([^\s]*)$/);
	if (!match) return null;
	return match[1]?.toLowerCase() ?? "";
}

function getMatchRank(commandName: string, query: string): number | null {
	if (query === "") return 0;
	if (commandName === query) return 0;
	if (commandName.startsWith(query)) return 1;
	if (commandName.includes(query)) return 2;
	return null;
}

function getCommandMatchRank(
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

export function useSlashCommands({
	inputValue,
	commands,
}: {
	inputValue: string;
	commands: SlashCommand[];
}) {
	const [selectedIndex, setSelectedIndex] = useState(0);

	const query = getSlashQuery(inputValue);
	const isOpen = query !== null;
	const suppressMenuForCommittedCommand = useMemo(
		() => shouldSuppressSlashMenuForCommittedCommand(query, commands),
		[commands, query],
	);

	const filteredCommands = useMemo(() => {
		if (!isOpen || query === null) return [];

		const rankedCommands = commands
			.map((command) => {
				const rank = getCommandMatchRank(command, query);
				return rank === null ? null : { command, rank };
			})
			.filter(
				(item): item is { command: SlashCommand; rank: number } =>
					item !== null,
			);

		return sortSlashCommandMatches(rankedCommands);
	}, [commands, isOpen, query]);

	const prevQuery = useRef(query);
	useEffect(() => {
		if (prevQuery.current !== query) {
			setSelectedIndex(0);
			prevQuery.current = query;
		}
	}, [query]);

	const navigateUp = useCallback(() => {
		setSelectedIndex((prev) =>
			prev <= 0 ? filteredCommands.length - 1 : prev - 1,
		);
	}, [filteredCommands.length]);

	const navigateDown = useCallback(() => {
		setSelectedIndex((prev) =>
			prev >= filteredCommands.length - 1 ? 0 : prev + 1,
		);
	}, [filteredCommands.length]);

	return {
		isOpen:
			isOpen && filteredCommands.length > 0 && !suppressMenuForCommittedCommand,
		filteredCommands,
		selectedIndex,
		setSelectedIndex,
		navigateUp,
		navigateDown,
	};
}

export function resolveCommandAction(command: SlashCommand): {
	text: string;
	shouldSend: boolean;
} {
	if (command.argumentHint.trim()) {
		return { text: `/${command.name} `, shouldSend: false };
	}
	return { text: "", shouldSend: true };
}
