import { useEffect, useRef, useState } from "react";
import { PLATFORM } from "renderer/hotkeys";
import {
	HOLD_JUMP_SHORTCUT_REVEAL_MS,
	type HoldJumpShortcutRevealMods,
	type HoldJumpShortcutRevealPhase,
	reduceHoldJumpShortcutReveal,
} from "./holdJumpShortcutReveal";

function modsFromEvent(event: KeyboardEvent): HoldJumpShortcutRevealMods {
	return {
		key: event.key,
		code: event.code,
		metaKey: event.metaKey,
		ctrlKey: event.ctrlKey,
		altKey: event.altKey,
		shiftKey: event.shiftKey,
		repeat: event.repeat,
	};
}

/**
 * True after the jump-to-workspace modifier (⌘ on Mac, Ctrl on Windows/Linux)
 * has been held alone for {@link HOLD_JUMP_SHORTCUT_REVEAL_MS}. Sidebar rows
 * use this to reveal their ⌘1–⌘9 hints.
 */
export function useHoldJumpShortcutReveal(
	delayMs = HOLD_JUMP_SHORTCUT_REVEAL_MS,
): boolean {
	const [visible, setVisible] = useState(false);
	const phaseRef = useRef<HoldJumpShortcutRevealPhase>("idle");
	const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

	useEffect(() => {
		const clearTimer = () => {
			if (timerRef.current == null) return;
			clearTimeout(timerRef.current);
			timerRef.current = null;
		};

		const apply = (
			input: Parameters<typeof reduceHoldJumpShortcutReveal>[1],
		) => {
			const result = reduceHoldJumpShortcutReveal(
				phaseRef.current,
				input,
				PLATFORM,
			);
			phaseRef.current = result.phase;
			if (result.clearTimer) clearTimer();
			if (result.startTimer) {
				clearTimer();
				timerRef.current = setTimeout(() => {
					phaseRef.current = "visible";
					timerRef.current = null;
					setVisible(true);
				}, delayMs);
			}
			setVisible(result.phase === "visible");
		};

		const onKeyDown = (event: KeyboardEvent) => {
			if (event.isComposing) return;
			apply({ type: "keydown", mods: modsFromEvent(event) });
		};
		const onKeyUp = (event: KeyboardEvent) => {
			apply({ type: "keyup", mods: modsFromEvent(event) });
		};
		const onReset = () => apply({ type: "reset" });
		const onVisibilityChange = () => {
			if (document.visibilityState !== "visible") onReset();
		};

		window.addEventListener("keydown", onKeyDown, true);
		window.addEventListener("keyup", onKeyUp, true);
		window.addEventListener("blur", onReset);
		document.addEventListener("visibilitychange", onVisibilityChange);
		return () => {
			clearTimer();
			window.removeEventListener("keydown", onKeyDown, true);
			window.removeEventListener("keyup", onKeyUp, true);
			window.removeEventListener("blur", onReset);
			document.removeEventListener("visibilitychange", onVisibilityChange);
		};
	}, [delayMs]);

	return visible;
}
