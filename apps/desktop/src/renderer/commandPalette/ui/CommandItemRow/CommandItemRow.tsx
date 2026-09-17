import { useLingui } from "@lingui/react/macro";
import { CommandItem, CommandShortcut } from "@superset/ui/command";
import { useHotkeyDisplay } from "renderer/hotkeys/hooks/useHotkeyDisplay";
import { useCommandContext } from "../../core/ContextProvider";
import type { Command } from "../../core/types";
import { PinCommandButton } from "./components/PinCommandButton";

interface CommandItemRowProps {
	command: Command;
	onSelect: (command: Command) => void;
}

export function CommandItemRow({ command, onSelect }: CommandItemRowProps) {
	const { i18n } = useLingui();
	const { isV2CloudEnabled } = useCommandContext();
	const display = useHotkeyDisplay(command.hotkeyId ?? "");
	const Icon = command.icon;
	const hasShortcut =
		Boolean(command.hotkeyId) && display.text && display.text !== "Unassigned";
	return (
		<CommandItem
			value={command.id}
			onSelect={() => onSelect(command)}
			className="group/command-row"
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
			<span>{i18n._(command.title)}</span>
			<span className="-my-1 ml-auto flex items-center gap-2">
				{hasShortcut ? <CommandShortcut>{display.text}</CommandShortcut> : null}
				{isV2CloudEnabled ? <PinCommandButton commandId={command.id} /> : null}
			</span>
		</CommandItem>
	);
}
