import { useEffect, useRef } from "react";
import { type Options, useHotkeys } from "react-hotkeys-hook";
import { formatHotkeyDisplay } from "../../display";
import type { HotkeyId } from "../../registry";
import { PLATFORM } from "../../registry";
import { useEffectiveLayoutMap } from "../../stores/keyboardPreferencesStore";
import type { HotkeyDisplay } from "../../types";
import { bindingToDispatchChord } from "../../utils/binding";
import { canonicalizeChord } from "../../utils/chord";
import { isStandaloneFnKeyEvent } from "../../utils/fnKey";
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

function isStandaloneFnChord(chord: string | null): boolean {
	return chord ? canonicalizeChord(chord) === "fn" : false;
}

type HotkeyTriggerFunction = Exclude<Options["enabled"], boolean | undefined>;
type HotkeyTriggerEvent = Parameters<HotkeyTriggerFunction>[1];

function evaluateTrigger(
	trigger: Options["enabled"] | Options["preventDefault"] | undefined,
	event: KeyboardEvent,
	chord: string,
	fallback: boolean,
): boolean {
	if (typeof trigger === "function") {
		return trigger(event, {
			hotkey: chord,
			keys: ["fn"],
		} as HotkeyTriggerEvent);
	}
	if (typeof trigger === "boolean") return trigger;
	return fallback;
}

export function useHotkey(
	id: HotkeyId,
	callback: (e: KeyboardEvent) => void,
	options?: Options,
): HotkeyDisplay {
	const binding = useBinding(id);
	const layoutMap = useEffectiveLayoutMap();
	const chord = bindingToDispatchChord(binding, layoutMap);
	const callbackRef = useRef(callback);
	callbackRef.current = callback;
	const optionsRef = useRef(options);
	optionsRef.current = options;
	const shouldUseFnListener = isStandaloneFnChord(chord);
	useHotkeys(
		shouldUseFnListener ? "" : (chord ?? ""),
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
			ignoreEventWhen: options?.ignoreEventWhen
				? (e) => shouldIgnoreEvent(e) || options.ignoreEventWhen?.(e) === true
				: shouldIgnoreEvent,
		},
		[chord, shouldUseFnListener],
	);

	useEffect(() => {
		if (!shouldUseFnListener) return;

		const handler = (event: KeyboardEvent) => {
			if (event.type !== "keydown") return;
			const currentOptions = optionsRef.current;
			const hotkeyChord = chord ?? "fn";
			if (!evaluateTrigger(currentOptions?.enabled, event, hotkeyChord, true)) {
				return;
			}
			if (shouldIgnoreEvent(event)) return;
			if (currentOptions?.ignoreEventWhen?.(event) === true) return;
			if (!isStandaloneFnKeyEvent(event)) return;
			if (
				evaluateTrigger(
					currentOptions?.preventDefault,
					event,
					hotkeyChord,
					true,
				)
			) {
				event.preventDefault();
			}
			callbackRef.current(event);
		};

		window.addEventListener("keydown", handler);
		return () => window.removeEventListener("keydown", handler);
	}, [chord, shouldUseFnListener]);

	return formatHotkeyDisplay(chord, PLATFORM, layoutMap);
}
