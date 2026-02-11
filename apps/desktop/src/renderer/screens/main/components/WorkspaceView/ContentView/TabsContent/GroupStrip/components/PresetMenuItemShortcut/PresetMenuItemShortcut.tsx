import { DropdownMenuShortcut } from "@superset/ui/dropdown-menu";
import { PRESET_HOTKEY_IDS } from "renderer/routes/_authenticated/_dashboard/workspace/$workspaceId/hooks/usePresetHotkeys";
import { useHotkeyText } from "renderer/stores/hotkeys";
import type { HotkeyId } from "shared/hotkeys";

function PresetMenuItemShortcutInner({ hotkeyId }: { hotkeyId: HotkeyId }) {
	const hotkeyText = useHotkeyText(hotkeyId);

	if (hotkeyText === "Unassigned") {
		return null;
	}

	return <DropdownMenuShortcut>{hotkeyText}</DropdownMenuShortcut>;
}

export function PresetMenuItemShortcut({ index }: { index: number }) {
	const hotkeyId = PRESET_HOTKEY_IDS[index];

	if (!hotkeyId) {
		return null;
	}

	return <PresetMenuItemShortcutInner hotkeyId={hotkeyId} />;
}
