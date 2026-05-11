import { useMemo } from "react";
import { formatHotkeyDisplay } from "../../display";
import { PLATFORM } from "../../registry";
import type { HotkeyDisplay } from "../../types";
import { useBinding } from "../useBinding";

export function useHotkeyDisplay(id: string): HotkeyDisplay {
	const chord = useBinding(id as Parameters<typeof useBinding>[0]);
	return useMemo(() => formatHotkeyDisplay(chord, PLATFORM), [chord]);
}

/**
 * Format an arbitrary chord (e.g. one captured during recording, before
 * it's saved). Use this when you have a chord string but no registered
 * hotkey id — most callers should use {@link useHotkeyDisplay} via the
 * hotkey id.
 */
export function useFormatBinding(chord: string | null): HotkeyDisplay {
	return useMemo(() => formatHotkeyDisplay(chord, PLATFORM), [chord]);
}
