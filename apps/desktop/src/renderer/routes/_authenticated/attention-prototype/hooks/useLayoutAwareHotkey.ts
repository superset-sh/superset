import { useRef } from "react";
import { useHotkeys } from "react-hotkeys-hook";
import { useEffectiveLayoutMap } from "renderer/hotkeys/stores/keyboardPreferencesStore";
import { bindingToDispatchChord } from "renderer/hotkeys/utils/binding";

/**
 * Prototype-local hotkey binding that respects the user's keyboard layout.
 *
 * react-hotkeys-hook matches letters by physical key code, so a bare
 * useHotkeys("meta+j") fires on the QWERTY J position even under Dvorak or
 * AZERTY. The app's own `useHotkey` solves this by translating a LOGICAL chord
 * through the keyboard-layout map into the equivalent code-based chord — but
 * it requires a registry HotkeyId. This hook applies the same translation to
 * an inline chord, for prototype shortcuts that shouldn't touch the shared
 * registry.
 */
export function useLayoutAwareHotkey(
	logicalChord: string,
	callback: (event: KeyboardEvent) => void,
): void {
	const layoutMap = useEffectiveLayoutMap();
	const chord =
		bindingToDispatchChord(
			{ version: 2, mode: "logical", chord: logicalChord },
			layoutMap,
		) ?? logicalChord;
	const callbackRef = useRef(callback);
	callbackRef.current = callback;
	useHotkeys(
		chord,
		(event) => {
			event.preventDefault();
			callbackRef.current(event);
		},
		{ enableOnFormTags: true, enableOnContentEditable: true },
		[chord],
	);
}
