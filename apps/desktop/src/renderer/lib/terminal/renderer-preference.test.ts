import { beforeEach, describe, expect, it } from "bun:test";
import {
	getTerminalRendererPreference,
	TERMINAL_RENDERER_PREFERENCE_KEY,
} from "./renderer-preference";

const mockStorage = new Map<string, string>();
const mockLocalStorage = {
	getItem: (key: string) => mockStorage.get(key) ?? null,
	setItem: (key: string, value: string) => mockStorage.set(key, value),
	removeItem: (key: string) => mockStorage.delete(key),
	clear: () => mockStorage.clear(),
};

// @ts-expect-error - mocking global localStorage for Node.js test environment
globalThis.localStorage = mockLocalStorage;

describe("getTerminalRendererPreference", () => {
	beforeEach(() => {
		mockStorage.clear();
	});

	it("returns undefined when no preference is stored", () => {
		expect(getTerminalRendererPreference()).toBeUndefined();
	});

	it("returns 'dom' when the user opts out of WebGL", () => {
		localStorage.setItem(TERMINAL_RENDERER_PREFERENCE_KEY, "dom");
		expect(getTerminalRendererPreference()).toBe("dom");
	});

	it("returns 'webgl' when the user explicitly opts into WebGL", () => {
		localStorage.setItem(TERMINAL_RENDERER_PREFERENCE_KEY, "webgl");
		expect(getTerminalRendererPreference()).toBe("webgl");
	});

	it("returns undefined for unrecognized values", () => {
		localStorage.setItem(TERMINAL_RENDERER_PREFERENCE_KEY, "canvas");
		expect(getTerminalRendererPreference()).toBeUndefined();
	});

	it("returns undefined when localStorage throws", () => {
		const original = globalThis.localStorage;
		// @ts-expect-error - simulate localStorage unavailable
		globalThis.localStorage = {
			getItem: () => {
				throw new Error("disabled");
			},
		};
		try {
			expect(getTerminalRendererPreference()).toBeUndefined();
		} finally {
			globalThis.localStorage = original;
		}
	});
});
