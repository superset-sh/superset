import { useRef } from "react";
import { type Options, useHotkeys } from "react-hotkeys-hook";
import { formatHotkeyDisplay } from "../../display";
import type { HotkeyId } from "../../registry";
import { PLATFORM } from "../../registry";
import { useKeyboardLayoutStore } from "../../stores/keyboardLayoutStore";
import type { HotkeyDisplay } from "../../types";
import { bindingToDispatchChord } from "../../utils/binding";
import { useBinding } from "../useBinding";

// react-hotkeys-hook doesn't check AltGraph or IME composition. Use its
// `ignoreEventWhen` option (runs after match, before preventDefault) to
// suppress those events so AltGr-typed printables and IME keystrokes pass
// through to the focused element.
function shouldIgnoreEvent(e: KeyboardEvent): boolean {
	if (e.isComposing || e.keyCode === 229) return true;
	if (e.getModifierState?.("AltGraph") === true) return true;
	return false;
}

export function useHotkey(
	id: HotkeyId,
	callback: (e: KeyboardEvent) => void,
	options?: Options,
): HotkeyDisplay {
	const binding = useBinding(id);
	const layoutMap = useKeyboardLayoutStore((s) => s.map);
	const chord = bindingToDispatchChord(binding, layoutMap);
	const callbackRef = useRef(callback);
	callbackRef.current = callback;
	const callerIgnore = options?.ignoreEventWhen;
	useHotkeys(
		chord ?? "",
		(e, _h) => {
			if (options?.preventDefault !== false) {
				e.preventDefault();
			}
			callbackRef.current(e);
		},
		{
			enableOnFormTags: true,
			enableOnContentEditable: true,
			...options,
			ignoreEventWhen: callerIgnore
				? (e) => shouldIgnoreEvent(e) || callerIgnore(e)
				: shouldIgnoreEvent,
		},
		[chord],
	);
	return formatHotkeyDisplay(chord, PLATFORM, layoutMap);
}
