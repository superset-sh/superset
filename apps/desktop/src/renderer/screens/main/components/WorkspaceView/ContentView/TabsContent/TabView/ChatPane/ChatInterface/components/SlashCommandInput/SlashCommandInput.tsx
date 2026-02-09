import { usePromptInputController } from "@superset/ui/ai-elements/prompt-input";
import { Popover, PopoverAnchor } from "@superset/ui/popover";
import { useCallback } from "react";
import {
	resolveCommandAction,
	type SlashCommand,
	useSlashCommands,
} from "../../hooks/useSlashCommands";
import { SlashCommandMenu } from "../SlashCommandMenu";

interface SlashCommandInputProps {
	onCommandSend: (command: SlashCommand) => void;
	cwd: string;
	children: React.ReactNode;
}

export function SlashCommandInput({
	onCommandSend,
	cwd,
	children,
}: SlashCommandInputProps) {
	const { textInput } = usePromptInputController();

	const slashCommands = useSlashCommands({
		inputValue: textInput.value,
		cwd,
	});

	const executeCommand = useCallback(
		(command: SlashCommand) => {
			const action = resolveCommandAction(command);
			if (action.shouldSend) {
				onCommandSend(command);
			}
			textInput.setInput(action.text);
		},
		[onCommandSend, textInput],
	);

	const handleKeyDownCapture = useCallback(
		(e: React.KeyboardEvent) => {
			if (!slashCommands.isOpen) return;

			switch (e.key) {
				case "Escape":
					e.preventDefault();
					e.stopPropagation();
					textInput.setInput("");
					break;
				case "Enter":
				case "Tab": {
					e.preventDefault();
					e.stopPropagation();
					const cmd =
						slashCommands.filteredCommands[slashCommands.selectedIndex];
					if (cmd) executeCommand(cmd);
					break;
				}
				case "ArrowUp":
					e.preventDefault();
					e.stopPropagation();
					slashCommands.navigateUp();
					break;
				case "ArrowDown":
					e.preventDefault();
					e.stopPropagation();
					slashCommands.navigateDown();
					break;
			}
		},
		[slashCommands, textInput, executeCommand],
	);

	return (
		<Popover open={slashCommands.isOpen}>
			<PopoverAnchor asChild>
				<div onKeyDownCapture={handleKeyDownCapture}>{children}</div>
			</PopoverAnchor>
			<SlashCommandMenu
				commands={slashCommands.filteredCommands}
				selectedIndex={slashCommands.selectedIndex}
				onSelect={executeCommand}
				onHover={slashCommands.setSelectedIndex}
			/>
		</Popover>
	);
}
