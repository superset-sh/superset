import { type HotkeyId, useHotkey } from "renderer/hotkeys";

export const PRESET_HOTKEY_IDS: HotkeyId[] = [
	"OPEN_PRESET_1",
	"OPEN_PRESET_2",
	"OPEN_PRESET_3",
	"OPEN_PRESET_4",
	"OPEN_PRESET_5",
	"OPEN_PRESET_6",
	"OPEN_PRESET_7",
	"OPEN_PRESET_8",
	"OPEN_PRESET_9",
];

export function usePresetHotkeys(
	openTabWithPreset: (presetIndex: number) => void,
) {
	useHotkey("OPEN_PRESET_1", () => openTabWithPreset(0));
	useHotkey("OPEN_PRESET_2", () => openTabWithPreset(1));
	useHotkey("OPEN_PRESET_3", () => openTabWithPreset(2));
	useHotkey("OPEN_PRESET_4", () => openTabWithPreset(3));
	useHotkey("OPEN_PRESET_5", () => openTabWithPreset(4));
	useHotkey("OPEN_PRESET_6", () => openTabWithPreset(5));
	useHotkey("OPEN_PRESET_7", () => openTabWithPreset(6));
	useHotkey("OPEN_PRESET_8", () => openTabWithPreset(7));
	useHotkey("OPEN_PRESET_9", () => openTabWithPreset(8));
}
