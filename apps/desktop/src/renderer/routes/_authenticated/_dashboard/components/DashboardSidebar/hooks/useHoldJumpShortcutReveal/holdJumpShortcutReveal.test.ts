import { describe, expect, test } from "bun:test";
import {
	type HoldJumpShortcutRevealMods,
	type HoldJumpShortcutRevealPhase,
	reduceHoldJumpShortcutReveal,
} from "./holdJumpShortcutReveal";

function mods(
	partial: Partial<HoldJumpShortcutRevealMods> &
		Pick<HoldJumpShortcutRevealMods, "key" | "code">,
): HoldJumpShortcutRevealMods {
	return {
		metaKey: false,
		ctrlKey: false,
		altKey: false,
		shiftKey: false,
		repeat: false,
		...partial,
	};
}

function reduce(
	phase: HoldJumpShortcutRevealPhase,
	input: Parameters<typeof reduceHoldJumpShortcutReveal>[1],
	platform: "mac" | "windows" = "mac",
) {
	return reduceHoldJumpShortcutReveal(phase, input, platform);
}

const metaDown = mods({
	key: "Meta",
	code: "MetaLeft",
	metaKey: true,
});
const ctrlDown = mods({
	key: "Control",
	code: "ControlLeft",
	ctrlKey: true,
});

describe("reduceHoldJumpShortcutReveal (mac)", () => {
	test("⌘ down starts the pending timer", () => {
		expect(reduce("idle", { type: "keydown", mods: metaDown })).toEqual({
			phase: "pending",
			startTimer: true,
			clearTimer: false,
		});
	});

	test("key-repeat on ⌘ does not restart the timer", () => {
		expect(
			reduce("pending", {
				type: "keydown",
				mods: { ...metaDown, repeat: true },
			}),
		).toEqual({
			phase: "pending",
			startTimer: false,
			clearTimer: false,
		});
	});

	test("⌘C before the timer fires cancels", () => {
		expect(
			reduce("pending", {
				type: "keydown",
				mods: mods({
					key: "c",
					code: "KeyC",
					metaKey: true,
				}),
			}),
		).toEqual({
			phase: "idle",
			startTimer: false,
			clearTimer: true,
		});
	});

	test("⌘ up while pending cancels", () => {
		expect(
			reduce("pending", {
				type: "keyup",
				mods: mods({ key: "Meta", code: "MetaLeft" }),
			}),
		).toEqual({
			phase: "idle",
			startTimer: false,
			clearTimer: true,
		});
	});

	test("⌘ up while visible hides the overlay", () => {
		expect(
			reduce("visible", {
				type: "keyup",
				mods: mods({ key: "Meta", code: "MetaLeft" }),
			}),
		).toEqual({
			phase: "idle",
			startTimer: false,
			clearTimer: true,
		});
	});

	test("pressing 1 while visible hides so the jump chord can fire", () => {
		expect(
			reduce("visible", {
				type: "keydown",
				mods: mods({
					key: "1",
					code: "Digit1",
					metaKey: true,
				}),
			}),
		).toEqual({
			phase: "idle",
			startTimer: false,
			clearTimer: true,
		});
	});

	test("⌘⇧ cancels because Shift is not part of the Mac jump chord", () => {
		expect(
			reduce("pending", {
				type: "keydown",
				mods: mods({
					key: "Shift",
					code: "ShiftLeft",
					metaKey: true,
					shiftKey: true,
				}),
			}),
		).toEqual({
			phase: "idle",
			startTimer: false,
			clearTimer: true,
		});
	});

	test("blur resets from either non-idle phase", () => {
		expect(reduce("pending", { type: "reset" }).phase).toBe("idle");
		expect(reduce("visible", { type: "reset" }).phase).toBe("idle");
	});
});

describe("reduceHoldJumpShortcutReveal (windows)", () => {
	test("Ctrl down starts the pending timer", () => {
		expect(
			reduce("idle", { type: "keydown", mods: ctrlDown }, "windows"),
		).toEqual({
			phase: "pending",
			startTimer: true,
			clearTimer: false,
		});
	});

	test("Ctrl+Shift stays pending — Shift is part of the jump chord", () => {
		expect(
			reduce(
				"pending",
				{
					type: "keydown",
					mods: mods({
						key: "Shift",
						code: "ShiftLeft",
						ctrlKey: true,
						shiftKey: true,
					}),
				},
				"windows",
			),
		).toEqual({
			phase: "pending",
			startTimer: false,
			clearTimer: false,
		});
	});

	test("releasing Shift while Ctrl is still held keeps the overlay", () => {
		expect(
			reduce(
				"visible",
				{
					type: "keyup",
					mods: mods({
						key: "Shift",
						code: "ShiftLeft",
						ctrlKey: true,
					}),
				},
				"windows",
			),
		).toEqual({
			phase: "visible",
			startTimer: false,
			clearTimer: false,
		});
	});

	test("Ctrl+C cancels", () => {
		expect(
			reduce(
				"pending",
				{
					type: "keydown",
					mods: mods({
						key: "c",
						code: "KeyC",
						ctrlKey: true,
					}),
				},
				"windows",
			),
		).toEqual({
			phase: "idle",
			startTimer: false,
			clearTimer: true,
		});
	});
});
