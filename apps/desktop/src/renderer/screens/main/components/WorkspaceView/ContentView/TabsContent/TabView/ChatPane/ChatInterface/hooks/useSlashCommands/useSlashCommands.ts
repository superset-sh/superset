import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { electronTrpc } from "renderer/lib/electron-trpc";

export interface SlashCommand {
	name: string;
	description: string;
	argumentHint: string;
}

const DEFAULT_COMMANDS: SlashCommand[] = [];

export function useSlashCommands({
	inputValue,
	cwd,
}: {
	inputValue: string;
	cwd: string;
}) {
	const utils = electronTrpc.useUtils();

	const { data } = electronTrpc.aiChat.getSlashCommands.useQuery(
		{ cwd },
		{ staleTime: 5 * 60 * 1000 },
	);

	const commands = useMemo(() => {
		const fetched = data?.commands;
		return fetched && fetched.length > 0 ? fetched : DEFAULT_COMMANDS;
	}, [data]);

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

	const prevIsOpen = useRef(false);
	useEffect(() => {
		if (isOpen && !prevIsOpen.current) {
			void utils.aiChat.getSlashCommands.invalidate();
		}
		prevIsOpen.current = isOpen;
	}, [isOpen, utils]);

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
