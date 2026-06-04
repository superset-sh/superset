import { DropdownMenuShortcut } from "@superset/ui/dropdown-menu";
import type { HotkeyId } from "renderer/hotkeys";
import { useHotkeyDisplay } from "renderer/hotkeys";

interface HotkeyMenuShortcutProps {
	hotkeyId: HotkeyId;
}

export function HotkeyMenuShortcut({ hotkeyId }: HotkeyMenuShortcutProps) {
	const { text } = useHotkeyDisplay(hotkeyId);
	if (text === "Unassigned") {
		return null;
	}
	return <DropdownMenuShortcut>{text}</DropdownMenuShortcut>;
}
