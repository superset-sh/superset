import type { KeyboardEvent as ReactKeyboardEvent } from "react";

type AnyKeyboardEvent = KeyboardEvent | ReactKeyboardEvent;

// True while an IME (Japanese/Chinese/Korean) composition is in progress.
// `keyCode === 229` is the legacy signal some browsers still emit during
// composition even when `isComposing` is not set.
export const isImeComposing = (e: AnyKeyboardEvent): boolean => {
	const native = "nativeEvent" in e ? e.nativeEvent : e;
	return native.isComposing || native.keyCode === 229;
};

export type IsEnterSubmitOptions = {
	// Require Cmd (mac) / Ctrl (other) to be held. Defaults to false.
	requireMod?: boolean;
	// Treat Shift+Enter as submit. Defaults to false (Shift+Enter = newline).
	allowShift?: boolean;
};

// Returns true only for an Enter press that should trigger a submit:
// not during IME composition, and matching the modifier policy.
export const isEnterSubmit = (
	e: AnyKeyboardEvent,
	{ requireMod = false, allowShift = false }: IsEnterSubmitOptions = {},
): boolean => {
	if (e.key !== "Enter") return false;
	if (isImeComposing(e)) return false;
	if (!allowShift && e.shiftKey) return false;
	if (requireMod && !(e.metaKey || e.ctrlKey)) return false;
	return true;
};
