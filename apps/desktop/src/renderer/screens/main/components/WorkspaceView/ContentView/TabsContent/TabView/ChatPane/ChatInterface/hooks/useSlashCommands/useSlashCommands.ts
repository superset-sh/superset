import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { electronTrpc } from "renderer/lib/electron-trpc";

export interface SlashCommand {
	name: string;
	description: string;
	argumentHint: string;
}

const DEFAULT_COMMANDS: SlashCommand[] = [
	{ name: "help", description: "Show available commands", argumentHint: "" },
	{
		name: "clear",
		description: "Clear conversation history",
		argumentHint: "",
	},
	{
		name: "compact",
		description: "Compact conversation context",
		argumentHint: "[instructions]",
	},
	{ name: "config", description: "Show configuration", argumentHint: "" },
	{
		name: "cost",
		description: "Show token usage and cost",
		argumentHint: "",
	},
	{
		name: "memory",
		description: "Edit CLAUDE.md memory files",
		argumentHint: "",
	},
	{
		name: "review",
		description: "Review a pull request",
		argumentHint: "[pr-url]",
	},
	{ name: "status", description: "Show status information", argumentHint: "" },
];

interface UseSlashCommandsOptions {
	inputValue: string;
	onClear: () => void;
	onSendMessage: (text: string) => void;
}

export function useSlashCommands({
	inputValue,
	onClear,
	onSendMessage,
}: UseSlashCommandsOptions) {
	const { data } = electronTrpc.aiChat.getSlashCommands.useQuery(undefined, {
		staleTime: 5 * 60 * 1000,
	});

	const commands = useMemo(() => {
		const fetched = data?.commands;
		if (fetched && fetched.length > 0) return fetched;
		return DEFAULT_COMMANDS;
	}, [data]);

	const [selectedIndex, setSelectedIndex] = useState(0);

	const isOpen =
		inputValue.startsWith("/") &&
		!inputValue.includes("\n") &&
		inputValue !== "/";

	const query = isOpen ? inputValue.slice(1).toLowerCase() : "";

	const filteredCommands = useMemo(() => {
		if (!isOpen) return [];
		if (query === "") return commands;
		return commands.filter((cmd) => cmd.name.startsWith(query));
	}, [commands, isOpen, query]);

	// Reset selected index when filter changes
	const prevQuery = useRef(query);
	useEffect(() => {
		if (prevQuery.current !== query) {
			setSelectedIndex(0);
			prevQuery.current = query;
		}
	}, [query]);

	const handleSelectCommand = useCallback(
		(command: SlashCommand): { text: string; shouldSend: boolean } => {
			if (command.name === "clear") {
				onClear();
				return { text: "", shouldSend: false };
			}

			if (command.argumentHint) {
				return { text: `/${command.name} `, shouldSend: false };
			}

			onSendMessage(`/${command.name}`);
			return { text: "", shouldSend: true };
		},
		[onClear, onSendMessage],
	);

	const handleKeyDown = useCallback(
		(e: React.KeyboardEvent): boolean => {
			if (!isOpen || filteredCommands.length === 0) return false;

			switch (e.key) {
				case "ArrowUp": {
					e.preventDefault();
					e.stopPropagation();
					setSelectedIndex((prev) =>
						prev <= 0 ? filteredCommands.length - 1 : prev - 1,
					);
					return true;
				}
				case "ArrowDown": {
					e.preventDefault();
					e.stopPropagation();
					setSelectedIndex((prev) =>
						prev >= filteredCommands.length - 1 ? 0 : prev + 1,
					);
					return true;
				}
				case "Enter":
				case "Tab": {
					e.preventDefault();
					e.stopPropagation();
					const cmd = filteredCommands[selectedIndex];
					if (cmd) {
						handleSelectCommand(cmd);
					}
					return true;
				}
				case "Escape": {
					e.preventDefault();
					e.stopPropagation();
					return true;
				}
				default:
					return false;
			}
		},
		[isOpen, filteredCommands, selectedIndex, handleSelectCommand],
	);

	return {
		isOpen: isOpen && filteredCommands.length > 0,
		filteredCommands,
		selectedIndex,
		setSelectedIndex,
		handleKeyDown,
		handleSelectCommand,
	};
}
