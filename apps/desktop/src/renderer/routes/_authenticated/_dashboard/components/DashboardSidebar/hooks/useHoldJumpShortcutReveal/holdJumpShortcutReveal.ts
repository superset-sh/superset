import type { Platform } from "renderer/hotkeys";

/**
 * Delay before ⌘1–⌘9 hints appear while the jump modifier is held. Long
 * enough that ⌘C / ⌘V never flash the overlay; short enough that a
 * deliberate peek still feels instant. Codex uses ~1s; 400ms matches the
 * sidebar hover-card open delay.
 */
export const HOLD_JUMP_SHORTCUT_REVEAL_MS = 400;

export type HoldJumpShortcutRevealPhase = "idle" | "pending" | "visible";

export interface HoldJumpShortcutRevealMods {
	key: string;
	code: string;
	metaKey: boolean;
	ctrlKey: boolean;
	altKey: boolean;
	shiftKey: boolean;
	repeat: boolean;
}

export type HoldJumpShortcutRevealInput =
	| { type: "keydown"; mods: HoldJumpShortcutRevealMods }
	| { type: "keyup"; mods: HoldJumpShortcutRevealMods }
	| { type: "reset" };

export interface HoldJumpShortcutRevealResult {
	phase: HoldJumpShortcutRevealPhase;
	startTimer: boolean;
	clearTimer: boolean;
}

function isMetaKey(key: string, code: string): boolean {
	return key === "Meta" || code === "MetaLeft" || code === "MetaRight";
}

function isControlKey(key: string, code: string): boolean {
	return key === "Control" || code === "ControlLeft" || code === "ControlRight";
}

function isShiftKey(key: string, code: string): boolean {
	return key === "Shift" || code === "ShiftLeft" || code === "ShiftRight";
}

function isRevealModifierKey(
	platform: Platform,
	mods: HoldJumpShortcutRevealMods,
): boolean {
	return platform === "mac"
		? isMetaKey(mods.key, mods.code)
		: isControlKey(mods.key, mods.code);
}

/**
 * Mac jump chords are ⌘1–⌘9 (no other modifiers). Win/Linux chords are
 * Ctrl+Shift+1–9, so Shift may stay held while the overlay is up.
 */
function isRevealChordHeld(
	platform: Platform,
	mods: Pick<
		HoldJumpShortcutRevealMods,
		"metaKey" | "ctrlKey" | "altKey" | "shiftKey"
	>,
): boolean {
	if (platform === "mac") {
		return mods.metaKey && !mods.ctrlKey && !mods.altKey && !mods.shiftKey;
	}
	return mods.ctrlKey && !mods.metaKey && !mods.altKey;
}

function isAllowedExtraKeydown(
	platform: Platform,
	mods: HoldJumpShortcutRevealMods,
): boolean {
	return platform !== "mac" && isShiftKey(mods.key, mods.code);
}

function idle(): HoldJumpShortcutRevealResult {
	return { phase: "idle", startTimer: false, clearTimer: true };
}

function unchanged(
	phase: HoldJumpShortcutRevealPhase,
): HoldJumpShortcutRevealResult {
	return { phase, startTimer: false, clearTimer: false };
}

export function reduceHoldJumpShortcutReveal(
	phase: HoldJumpShortcutRevealPhase,
	input: HoldJumpShortcutRevealInput,
	platform: Platform,
): HoldJumpShortcutRevealResult {
	if (input.type === "reset") return idle();

	if (input.type === "keyup") {
		return isRevealChordHeld(platform, input.mods) ? unchanged(phase) : idle();
	}

	const { mods } = input;
	if (
		isRevealModifierKey(platform, mods) &&
		isRevealChordHeld(platform, mods)
	) {
		if (mods.repeat || phase !== "idle") return unchanged(phase);
		return { phase: "pending", startTimer: true, clearTimer: false };
	}

	if (phase === "idle") return unchanged(phase);
	if (
		isAllowedExtraKeydown(platform, mods) &&
		isRevealChordHeld(platform, mods)
	) {
		return unchanged(phase);
	}
	return idle();
}
