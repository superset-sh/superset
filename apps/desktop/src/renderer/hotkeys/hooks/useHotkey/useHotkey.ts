import { useRef } from "react";
import { type Options, useHotkeys } from "react-hotkeys-hook";
import { formatHotkeyDisplay } from "../../display";
import type { HotkeyId } from "../../registry";
import { PLATFORM } from "../../registry";
import type { HotkeyDisplay } from "../../types";
import { useBinding } from "../useBinding";

// react-hotkeys-hook does its own match against event.code/key and the four
// modifier booleans (see node_modules/react-hotkeys-hook/dist/index.js,
// function `re`). It does NOT check AltGraph or composition, so app hotkeys
// would otherwise fire on AltGr-typed printables (Linux/Windows) and during
// CJK composition. `ignoreEventWhen` is the library's documented suppression
// hook (Options.ignoreEventWhen, dist/index.js line 224) — runs after match
// but before preventDefault and the callback, so the IME / AltGr keystroke
// passes through to the focused element unmodified.
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
	const keys = useBinding(id);
	const callbackRef = useRef(callback);
	callbackRef.current = callback;
	const callerIgnore = options?.ignoreEventWhen;
	useHotkeys(
		keys ?? "",
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
		[keys],
	);
	return formatHotkeyDisplay(keys, PLATFORM);
}
