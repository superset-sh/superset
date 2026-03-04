import { useAppHotkey } from "renderer/stores/hotkeys";
import type { HotkeyId } from "shared/hotkeys";

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
	useAppHotkey(PRESET_HOTKEY_IDS[0], () => openTabWithPreset(0), undefined, [
		openTabWithPreset,
	]);
	useAppHotkey(PRESET_HOTKEY_IDS[1], () => openTabWithPreset(1), undefined, [
		openTabWithPreset,
	]);
	useAppHotkey(PRESET_HOTKEY_IDS[2], () => openTabWithPreset(2), undefined, [
		openTabWithPreset,
	]);
	useAppHotkey(PRESET_HOTKEY_IDS[3], () => openTabWithPreset(3), undefined, [
		openTabWithPreset,
	]);
	useAppHotkey(PRESET_HOTKEY_IDS[4], () => openTabWithPreset(4), undefined, [
		openTabWithPreset,
	]);
	useAppHotkey(PRESET_HOTKEY_IDS[5], () => openTabWithPreset(5), undefined, [
		openTabWithPreset,
	]);
	useAppHotkey(PRESET_HOTKEY_IDS[6], () => openTabWithPreset(6), undefined, [
		openTabWithPreset,
	]);
	useAppHotkey(PRESET_HOTKEY_IDS[7], () => openTabWithPreset(7), undefined, [
		openTabWithPreset,
	]);
	useAppHotkey(PRESET_HOTKEY_IDS[8], () => openTabWithPreset(8), undefined, [
		openTabWithPreset,
	]);
}
