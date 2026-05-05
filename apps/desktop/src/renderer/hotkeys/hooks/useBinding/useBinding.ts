import { HOTKEYS, type HotkeyId } from "../../registry";
import { useHotkeyOverridesStore } from "../../stores/hotkeyOverridesStore";
import { useKeyboardLayoutStore } from "../../stores/keyboardLayoutStore";
import { useKeyboardPreferencesStore } from "../../stores/keyboardPreferencesStore";
import type { ShortcutBinding } from "../../types";
import { bindingToDispatchChord } from "../../utils/binding";

/**
 * Reactive: get the effective binding for a hotkey (override ?? default).
 * Returns the raw stored shape — bare chord string (legacy / shipped
 * defaults, treated as physical mode) or v2 object. Use `parseBinding` to
 * normalize.
 */
export function useBinding(id: HotkeyId): ShortcutBinding | null {
	return useHotkeyOverridesStore((state) => {
		if (!id) return null;
		if (id in state.overrides) return state.overrides[id] ?? null;
		return HOTKEYS[id]?.key ?? null;
	});
}

/** Imperative version of {@link useBinding} for non-React contexts. */
export function getBinding(id: HotkeyId): ShortcutBinding | null {
	const state = useHotkeyOverridesStore.getState();
	if (!id) return null;
	if (id in state.overrides) return state.overrides[id] ?? null;
	return HOTKEYS[id]?.key ?? null;
}

/**
 * Imperative dispatch-form chord (event.code-based, layout-translated for
 * logical bindings). Use when synthesizing KeyboardEvents that should match
 * the same registration `useHotkey` makes — otherwise the event won't fire
 * the bound handler on non-US layouts.
 */
export function getDispatchChord(id: HotkeyId): string | null {
	const adaptive = useKeyboardPreferencesStore.getState().adaptiveLayoutEnabled;
	const layoutMap = adaptive ? useKeyboardLayoutStore.getState().map : null;
	return bindingToDispatchChord(getBinding(id), layoutMap);
}
