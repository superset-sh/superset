import { useMemo } from "react";
import { formatHotkeyDisplay } from "../../display";
import { PLATFORM } from "../../registry";
import { useKeyboardLayoutStore } from "../../stores/keyboardLayoutStore";
import type { HotkeyDisplay } from "../../types";
import { parseBinding } from "../../utils/binding";
import { useBinding } from "../useBinding";

export function useHotkeyDisplay(id: string): HotkeyDisplay {
	const binding = useBinding(id as Parameters<typeof useBinding>[0]);
	const layoutMap = useKeyboardLayoutStore((s) => s.map);
	const chord = binding ? parseBinding(binding).chord : null;
	return useMemo(
		() => formatHotkeyDisplay(chord, PLATFORM, layoutMap),
		[chord, layoutMap],
	);
}

/**
 * Format an arbitrary chord (e.g. one captured during recording, before it's
 * saved) with layout-aware glyphs. Use this when you have a chord but no
 * registered hotkey id — most callers should use {@link useHotkeyDisplay}.
 */
export function useFormatChord(chord: string | null): HotkeyDisplay {
	const layoutMap = useKeyboardLayoutStore((s) => s.map);
	return useMemo(
		() => formatHotkeyDisplay(chord, PLATFORM, layoutMap),
		[chord, layoutMap],
	);
}
