import {
	PromptInput,
	PromptInputTextarea,
	usePromptInputController,
} from "@superset/ui/ai-elements/prompt-input";
import { useCallback } from "react";
import {
	resolveCommandAction,
	type SlashCommand,
	useSlashCommands,
} from "../../hooks/useSlashCommands";
import { SlashCommandMenu } from "../SlashCommandMenu";

interface SlashCommandInputProps {
	onSubmit: (message: { text: string }) => void;
	onClear: () => void;
	onCommandSend: (command: SlashCommand) => void;
	children: React.ReactNode;
}

export function SlashCommandInput({
	onSubmit,
	onClear,
	onCommandSend,
	children,
}: SlashCommandInputProps) {
	const { textInput } = usePromptInputController();

	const slashCommands = useSlashCommands({ inputValue: textInput.value });

	const executeCommand = useCallback(
		(command: SlashCommand) => {
			const action = resolveCommandAction(command);
			if (action.isClear) {
				onClear();
			} else if (action.shouldSend) {
				onCommandSend(command);
			}
			textInput.setInput(action.text);
		},
		[onClear, onCommandSend, textInput],
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
		<div className="relative">
			{slashCommands.isOpen && (
				<SlashCommandMenu
					commands={slashCommands.filteredCommands}
					selectedIndex={slashCommands.selectedIndex}
					onSelect={executeCommand}
					onHover={slashCommands.setSelectedIndex}
				/>
			)}
			<div onKeyDownCapture={handleKeyDownCapture}>
				<PromptInput onSubmit={onSubmit}>
					<PromptInputTextarea placeholder="Ask anything..." />
					{children}
				</PromptInput>
			</div>
		</div>
	);
}
