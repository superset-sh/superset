import { CommandItem, CommandShortcut } from "@superset/ui/command";
import { useHotkeyDisplay } from "renderer/hotkeys/hooks/useHotkeyDisplay";
import type { Command } from "../../core/types";

interface CommandItemRowProps {
	command: Command;
	onSelect: (command: Command) => void;
}

export function CommandItemRow({ command, onSelect }: CommandItemRowProps) {
	const display = useHotkeyDisplay(command.hotkeyId ?? "");
	const Icon = command.icon;
	const hasShortcut =
		Boolean(command.hotkeyId) && display.text && display.text !== "Unassigned";
	return (
		<CommandItem
			value={`${command.id} ${command.title} ${(command.keywords ?? []).join(" ")}`}
			onSelect={() => onSelect(command)}
		>
			{command.iconUrl ? (
				<img
					src={command.iconUrl}
					alt=""
					className="size-4 shrink-0 object-contain"
				/>
			) : Icon ? (
				<Icon />
			) : null}
			<span>{command.title}</span>
			{hasShortcut ? <CommandShortcut>{display.text}</CommandShortcut> : null}
		</CommandItem>
	);
}
