import { HOTKEYS, type HotkeyId } from "../../registry";
import { useHotkeyOverridesStore } from "../../stores/hotkeyOverridesStore";

/**
 * Reactive: get the effective binding chord for a hotkey
 * (override ?? default), or `null` if unbound. The chord is a bare string
 * like `"meta+shift+p"`.
 */
export function useBinding(id: HotkeyId): string | null {
	return useHotkeyOverridesStore((state) => {
		if (!id) return null;
		if (id in state.overrides) return state.overrides[id] ?? null;
		return HOTKEYS[id]?.key ?? null;
	});
}

/** Imperative version of {@link useBinding} for non-React contexts. */
export function getBinding(id: HotkeyId): string | null {
	const state = useHotkeyOverridesStore.getState();
	if (!id) return null;
	if (id in state.overrides) return state.overrides[id] ?? null;
	return HOTKEYS[id]?.key ?? null;
}
