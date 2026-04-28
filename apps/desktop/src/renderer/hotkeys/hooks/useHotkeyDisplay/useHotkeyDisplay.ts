import { useMemo } from "react";
import { formatHotkeyDisplay } from "../../display";
import { PLATFORM } from "../../registry";
import { useKeyboardLayoutStore } from "../../stores/keyboardLayoutStore";
import type { HotkeyDisplay } from "../../types";
import { useBinding } from "../useBinding";

export function useHotkeyDisplay(id: string): HotkeyDisplay {
	const binding = useBinding(id as Parameters<typeof useBinding>[0]);
	const layoutMap = useKeyboardLayoutStore((s) => s.map);
	return useMemo(
		() => formatHotkeyDisplay(binding, PLATFORM, layoutMap),
		[binding, layoutMap],
	);
}
