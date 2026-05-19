import { beforeEach, describe, expect, test } from "bun:test";
import { useModifierKeyStateStore } from "./modifier-key-state";

describe("useModifierKeyStateStore", () => {
	beforeEach(() => {
		useModifierKeyStateStore.getState().clearAll();
	});

	test("initial state has empty heldKeys and isModifierHeld false", () => {
		const state = useModifierKeyStateStore.getState();
		expect(state.heldKeys).toEqual(new Set());
		expect(state.isModifierHeld).toBe(false);
	});

	test("pressKey adds a key to heldKeys", () => {
		useModifierKeyStateStore.getState().pressKey("Meta");
		expect(useModifierKeyStateStore.getState().heldKeys).toEqual(
			new Set(["Meta"]),
		);
	});

	test("pressKey is a no-op if key already held", () => {
		useModifierKeyStateStore.getState().pressKey("Meta");
		useModifierKeyStateStore.getState().pressKey("Meta");
		expect(useModifierKeyStateStore.getState().heldKeys).toEqual(
			new Set(["Meta"]),
		);
		expect(useModifierKeyStateStore.getState().heldKeys.size).toBe(1);
	});

	test("releaseKey removes a key from heldKeys", () => {
		useModifierKeyStateStore.getState().pressKey("Meta");
		useModifierKeyStateStore.getState().pressKey("Control");
		useModifierKeyStateStore.getState().releaseKey("Meta");
		expect(useModifierKeyStateStore.getState().heldKeys).toEqual(
			new Set(["Control"]),
		);
	});

	test("releaseKey is a no-op if key not held", () => {
		useModifierKeyStateStore.getState().pressKey("Meta");
		useModifierKeyStateStore.getState().releaseKey("Control");
		expect(useModifierKeyStateStore.getState().heldKeys).toEqual(
			new Set(["Meta"]),
		);
	});

	test("clearAll resets heldKeys to empty and isModifierHeld to false", () => {
		useModifierKeyStateStore.getState().pressKey("Meta");
		useModifierKeyStateStore.getState().pressKey("Control");
		useModifierKeyStateStore.setState({ isModifierHeld: true });
		useModifierKeyStateStore.getState().clearAll();
		expect(useModifierKeyStateStore.getState().heldKeys).toEqual(new Set());
		expect(useModifierKeyStateStore.getState().isModifierHeld).toBe(false);
	});
});
