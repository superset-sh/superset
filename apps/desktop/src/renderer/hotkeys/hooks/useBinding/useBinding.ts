import { HOTKEYS, type HotkeyId } from "../../registry";
import { useHotkeyOverridesStore } from "../../stores/hotkeyOverridesStore";

/** Reactive: get the effective key binding for a hotkey (override ?? default) */
export function useBinding(id: HotkeyId): string | null {
	return useHotkeyOverridesStore((state) => {
		if (!id) return null;
		if (id in state.overrides) return state.overrides[id] ?? null;
		return HOTKEYS[id]?.key ?? null;
	});
}

/** Imperative: get the effective key binding (for non-React contexts like xterm) */
export function getBinding(id: HotkeyId): string | null {
	const state = useHotkeyOverridesStore.getState();
	if (!id) return null;
	if (id in state.overrides) return state.overrides[id] ?? null;
	return HOTKEYS[id]?.key ?? null;
}
