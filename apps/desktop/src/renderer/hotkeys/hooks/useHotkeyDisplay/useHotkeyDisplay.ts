import { useMemo } from "react";
import { formatHotkeyDisplay } from "../../display";
import { PLATFORM } from "../../registry";
import { useKeyboardLayoutStore } from "../../stores/keyboardLayoutStore";
import type { HotkeyDisplay, ShortcutBinding } from "../../types";
import { bindingToDispatchChord } from "../../utils/binding";
import { useBinding } from "../useBinding";

export function useHotkeyDisplay(id: string): HotkeyDisplay {
	const binding = useBinding(id as Parameters<typeof useBinding>[0]);
	const layoutMap = useKeyboardLayoutStore((s) => s.map);
	const chord = bindingToDispatchChord(binding, layoutMap);
	return useMemo(
		() => formatHotkeyDisplay(chord, PLATFORM, layoutMap),
		[chord, layoutMap],
	);
}

/**
 * Format an arbitrary binding (e.g. one captured during recording, before
 * it's saved) with layout-aware glyphs. Use this when you have a
 * ShortcutBinding but no registered hotkey id — most callers should use
 * {@link useHotkeyDisplay} via the hotkey id.
 */
export function useFormatBinding(
	binding: ShortcutBinding | null,
): HotkeyDisplay {
	const layoutMap = useKeyboardLayoutStore((s) => s.map);
	const chord = bindingToDispatchChord(binding, layoutMap);
	return useMemo(
		() => formatHotkeyDisplay(chord, PLATFORM, layoutMap),
		[chord, layoutMap],
	);
}
