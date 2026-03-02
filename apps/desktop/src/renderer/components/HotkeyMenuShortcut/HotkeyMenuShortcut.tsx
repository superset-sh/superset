import { DropdownMenuShortcut } from "@superset/ui/dropdown-menu";
import { useHotkeyText } from "renderer/stores/hotkeys";
import type { HotkeyId } from "shared/hotkeys";

interface HotkeyMenuShortcutProps {
	hotkeyId: HotkeyId;
}

export function HotkeyMenuShortcut({ hotkeyId }: HotkeyMenuShortcutProps) {
	const hotkeyText = useHotkeyText(hotkeyId);
	if (hotkeyText === "Unassigned") {
		return null;
	}
	return <DropdownMenuShortcut>{hotkeyText}</DropdownMenuShortcut>;
}
