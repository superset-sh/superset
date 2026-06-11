import { HOTKEYS, type HotkeyId } from "../registry";
import { useHotkeyOverridesStore } from "../stores/hotkeyOverridesStore";
import { useKeyboardLayoutStore } from "../stores/keyboardLayoutStore";
import {
	getEffectiveLayoutMap,
	useKeyboardPreferencesStore,
} from "../stores/keyboardPreferencesStore";
import type { ShortcutBinding } from "../types";
import { bindingToDispatchChord } from "./binding";
import { canonicalizeChord, eventToChord } from "./chord";
import { isStandaloneFnKeyEvent } from "./fnKey";

export {
	canonicalizeChord,
	eventToChord,
	isIgnorableKey,
	isTerminalReservedEvent,
	MODIFIERS,
	matchesChord,
	normalizeToken,
	TERMINAL_RESERVED_CHORDS,
} from "./chord";

/**
 * KeyboardEvent → registered {@link HotkeyId}, or `null` if unbound. Uses the
 * same `event.code` normalization as react-hotkeys-hook so the reverse index
 * can't drift from the matcher. Index reflects current overrides, not frozen
 * defaults — see {@link registeredAppChords}.
 */
export function resolveHotkeyFromEvent(event: KeyboardEvent): HotkeyId | null {
	if (event.type !== "keydown") return null;
	const chord =
		eventToChord(event) ?? (isStandaloneFnKeyEvent(event) ? "fn" : null);
	if (!chord) return null;
	return registeredAppChords.get(chord) ?? null;
}

function buildRegisteredAppChords(
	overrides: Record<string, ShortcutBinding | null>,
	layoutMap: ReadonlyMap<string, string> | null,
): Map<string, HotkeyId> {
	const map = new Map<string, HotkeyId>();
	for (const id of Object.keys(HOTKEYS) as HotkeyId[]) {
		const hasOverride = id in overrides;
		const override = hasOverride ? overrides[id] : undefined;
		// Explicit unassignment (null override) must drop from the index — else
		// the terminal's isAppHotkey check would swallow the freed chord.
		if (hasOverride && override === null) continue;
		const binding = override ?? HOTKEYS[id].key;
		if (!binding) continue;
		const dispatchChord = bindingToDispatchChord(binding, layoutMap);
		if (!dispatchChord) continue;
		map.set(canonicalizeChord(dispatchChord), id);
	}
	return map;
}

// Reassigned on each override, layout, OR adaptive-layout-toggle change;
// `let` is required so the subscribe callbacks can replace the reference
// the resolver reads. Read the layout map through `getEffectiveLayoutMap`
// so the toggle state is honored on every rebuild.
let registeredAppChords = buildRegisteredAppChords(
	useHotkeyOverridesStore.getState().overrides,
	getEffectiveLayoutMap(),
);
function rebuild() {
	registeredAppChords = buildRegisteredAppChords(
		useHotkeyOverridesStore.getState().overrides,
		getEffectiveLayoutMap(),
	);
}
useHotkeyOverridesStore.subscribe(rebuild);
useKeyboardLayoutStore.subscribe(rebuild);
useKeyboardPreferencesStore.subscribe(rebuild);
