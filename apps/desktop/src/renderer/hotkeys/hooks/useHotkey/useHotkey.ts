import { useRef } from "react";
import { type Options, useHotkeys } from "react-hotkeys-hook";
import { formatHotkeyDisplay } from "../../display";
import type { HotkeyId } from "../../registry";
import { PLATFORM } from "../../registry";
import type { HotkeyDisplay } from "../../types";
import { useBinding } from "../useBinding";

export function useHotkey(
	id: HotkeyId,
	callback: (e: KeyboardEvent) => void,
	options?: Options,
): HotkeyDisplay {
	const keys = useBinding(id);
	const callbackRef = useRef(callback);
	callbackRef.current = callback;
	useHotkeys(
		keys ?? "",
		(e, _h) => callbackRef.current(e),
		{ enableOnFormTags: true, ...options },
		[keys],
	);
	return formatHotkeyDisplay(keys, PLATFORM);
}
