import { afterEach, describe, expect, it } from "bun:test";
import {
	isUSCompatibleLayout,
	resetUSLayoutCacheForTests,
} from "./detectUSLayout";

type Keyboard = {
	getLayoutMap?: () => Promise<ReadonlyMap<string, string>>;
};

function withKeyboard(keyboard: Keyboard | undefined, fn: () => Promise<void>) {
	const original = (navigator as Navigator & { keyboard?: Keyboard }).keyboard;
	(navigator as Navigator & { keyboard?: Keyboard }).keyboard = keyboard;
	resetUSLayoutCacheForTests();
	return fn().finally(() => {
		(navigator as Navigator & { keyboard?: Keyboard }).keyboard = original;
		resetUSLayoutCacheForTests();
	});
}

describe("isUSCompatibleLayout", () => {
	afterEach(() => {
		resetUSLayoutCacheForTests();
	});

	it("returns 'unknown' when navigator.keyboard is unavailable", async () => {
		await withKeyboard(undefined, async () => {
			expect(await isUSCompatibleLayout()).toBe("unknown");
		});
	});

	it("returns 'unknown' when getLayoutMap is missing", async () => {
		await withKeyboard({}, async () => {
			expect(await isUSCompatibleLayout()).toBe("unknown");
		});
	});

	it("returns 'unknown' when getLayoutMap throws", async () => {
		await withKeyboard(
			{
				getLayoutMap: async () => {
					throw new Error("not allowed in this context");
				},
			},
			async () => {
				expect(await isUSCompatibleLayout()).toBe("unknown");
			},
		);
	});

	it("returns true for a US-QWERTY map", async () => {
		await withKeyboard(
			{
				getLayoutMap: async () =>
					new Map([
						["KeyA", "a"],
						["KeyQ", "q"],
						["KeyW", "w"],
						["KeyZ", "z"],
						["Semicolon", ";"],
						["Quote", "'"],
					]),
			},
			async () => {
				expect(await isUSCompatibleLayout()).toBe(true);
			},
		);
	});

	it("returns false for a German QWERTZ map (Y/Z swapped)", async () => {
		await withKeyboard(
			{
				getLayoutMap: async () =>
					new Map([
						["KeyA", "a"],
						["KeyQ", "q"],
						["KeyW", "w"],
						["KeyZ", "y"], // QWERTZ
						["Semicolon", "ö"],
						["Quote", "ä"],
					]),
			},
			async () => {
				expect(await isUSCompatibleLayout()).toBe(false);
			},
		);
	});
});
