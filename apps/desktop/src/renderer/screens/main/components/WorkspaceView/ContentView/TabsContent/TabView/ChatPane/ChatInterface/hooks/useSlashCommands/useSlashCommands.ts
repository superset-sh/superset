import type { SlashCommand } from "@superset/durable-session/react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

export type { SlashCommand };

export function useSlashCommands({
	inputValue,
	commands,
}: {
	inputValue: string;
	commands: SlashCommand[];
}) {
	const [selectedIndex, setSelectedIndex] = useState(0);

	const isOpen =
		inputValue.startsWith("/") &&
		!inputValue.includes("\n") &&
		!inputValue.includes(" ");

	const query = isOpen ? inputValue.slice(1).toLowerCase() : "";

	const filteredCommands = useMemo(() => {
		if (!isOpen) return [];
		if (query === "") return commands;
		return commands.filter((cmd) => cmd.name.startsWith(query));
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
