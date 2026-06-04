import { CommandEmpty, CommandGroup, CommandList } from "@superset/ui/command";
import { useCommandContext } from "../../core/ContextProvider";
import type { Command } from "../../core/types";
import { useActiveCommands } from "../../core/useActiveCommands";
import { CommandItemRow } from "../CommandItemRow/CommandItemRow";

interface CommandListViewProps {
	onSelect: (command: Command) => void;
}

export function CommandListView({ onSelect }: CommandListViewProps) {
	const context = useCommandContext();
	const sections = useActiveCommands(context);

	return (
		<CommandList>
			<CommandEmpty>No commands found.</CommandEmpty>
			{sections.map((section) => (
				<CommandGroup key={section.id} heading={section.label}>
					{section.commands.map((command) => (
						<CommandItemRow
							key={command.id}
							command={command}
							onSelect={onSelect}
						/>
					))}
				</CommandGroup>
			))}
		</CommandList>
	);
}
