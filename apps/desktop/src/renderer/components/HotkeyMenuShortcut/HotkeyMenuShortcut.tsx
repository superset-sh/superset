import { ContextMenuShortcut } from "@superset/ui/context-menu";
import { DropdownMenuShortcut } from "@superset/ui/dropdown-menu";
import { useHotkeyText } from "renderer/stores/hotkeys";
import type { HotkeyId } from "shared/hotkeys";

interface HotkeyMenuShortcutProps {
	hotkeyId: HotkeyId;
	variant?: "dropdown" | "context";
}

export function HotkeyMenuShortcut({
	hotkeyId,
	variant = "dropdown",
}: HotkeyMenuShortcutProps) {
	const hotkeyText = useHotkeyText(hotkeyId);
	if (hotkeyText === "Unassigned") {
		return null;
	}
	if (variant === "context") {
		return <ContextMenuShortcut>{hotkeyText}</ContextMenuShortcut>;
	}
	return <DropdownMenuShortcut>{hotkeyText}</DropdownMenuShortcut>;
}
