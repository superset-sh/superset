import type { ChatServiceRouter } from "@superset/chat/host";
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

	const filteredCommands = useMemo(() => {
		if (!isOpen || query === null) return [];

		const rankedCommands = commands
			.map((command) => {
				const rank = getMatchRank(command.name.toLowerCase(), query);
				return rank === null ? null : { command, rank };
			})
			.filter(
				(item): item is { command: SlashCommand; rank: number } =>
					item !== null,
			)
			.sort((a, b) => {
				if (a.rank !== b.rank) return a.rank - b.rank;
				return a.command.name.localeCompare(b.command.name);
			});

		return rankedCommands.map((item) => item.command);
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
		isOpen: isOpen && filteredCommands.length > 0,
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
	if (command.argumentHint) {
		return { text: `/${command.name} `, shouldSend: false };
	}
	return { text: "", shouldSend: true };
}
