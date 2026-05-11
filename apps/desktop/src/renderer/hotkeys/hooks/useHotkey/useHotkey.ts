import { useRef } from "react";
import { type Options, useHotkeys } from "react-hotkeys-hook";
import { formatHotkeyDisplay } from "../../display";
import type { HotkeyId } from "../../registry";
import { PLATFORM } from "../../registry";
import { useKeyboardPreferencesStore } from "../../stores/keyboardPreferencesStore";
import type { HotkeyDisplay } from "../../types";
import {
	canonicalizeChord,
	eventToChord,
} from "../../utils/resolveHotkeyFromEvent";
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
	const chord = useBinding(id);
	const matchByTypedKey = useKeyboardPreferencesStore((s) => s.matchByTypedKey);
	const callbackRef = useRef(callback);
	callbackRef.current = callback;
	const callerIgnore = options?.ignoreEventWhen;
	// Strict match: react-hotkeys-hook with `useKey: true` matches on either
	// event.key OR event.code (its matcher is additive — see dist/index.js
	// lines 117-131). To get clean "typed character only" semantics we
	// suppress events whose `eventToChord` form (which obeys the toggle)
	// doesn't equal the bound chord.
	const strictMatch = chord
		? (e: KeyboardEvent) => {
				const evChord = eventToChord(e);
				return evChord !== canonicalizeChord(chord);
			}
		: () => true;
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
			useKey: matchByTypedKey,
			ignoreEventWhen: callerIgnore
				? (e) => shouldIgnoreEvent(e) || strictMatch(e) || callerIgnore(e)
				: (e) => shouldIgnoreEvent(e) || strictMatch(e),
		},
		[chord, matchByTypedKey],
	);
	return formatHotkeyDisplay(chord, PLATFORM);
}
