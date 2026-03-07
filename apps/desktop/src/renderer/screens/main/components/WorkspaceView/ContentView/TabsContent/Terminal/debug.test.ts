import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import {
	isTerminalDebugEnabled,
	parseTerminalDebugChannels,
	TERMINAL_DEBUG_PANE_STORAGE_KEY,
	TERMINAL_DEBUG_STORAGE_KEY,
} from "./debug";

const storage = new Map<string, string>();
const localStorageMock = {
	getItem: (key: string) => storage.get(key) ?? null,
	setItem: (key: string, value: string) => storage.set(key, value),
	removeItem: (key: string) => storage.delete(key),
	clear: () => storage.clear(),
};

const originalWindow = globalThis.window;

describe("terminal debug switches", () => {
	beforeEach(() => {
		storage.clear();
		// @ts-expect-error test shim
		globalThis.window = { localStorage: localStorageMock };
	});

	afterEach(() => {
		storage.clear();
		if (originalWindow === undefined) {
			// @ts-expect-error test cleanup
			delete globalThis.window;
			return;
		}

		globalThis.window = originalWindow;
	});

	it("treats 1 as enable-all", () => {
		expect(parseTerminalDebugChannels("1")).toBe("all");
	});

	it("parses comma-separated channel lists", () => {
		const channels = parseTerminalDebugChannels("stream, focus,invalid");
		expect(channels).not.toBe("all");
		expect(channels instanceof Set).toBe(true);
		expect(channels instanceof Set && channels.has("stream")).toBe(true);
		expect(channels instanceof Set && channels.has("focus")).toBe(true);
		expect(channels instanceof Set && channels.has("attach")).toBe(false);
	});

	it("parses dom channel", () => {
		const channels = parseTerminalDebugChannels("dom");
		expect(channels).not.toBe("all");
		expect(channels instanceof Set && channels.has("dom")).toBe(true);
	});

	it("supports pane filtering", () => {
		localStorageMock.setItem(TERMINAL_DEBUG_STORAGE_KEY, "stream,focus");
		localStorageMock.setItem(TERMINAL_DEBUG_PANE_STORAGE_KEY, "pane-2");

		expect(isTerminalDebugEnabled("stream", "pane-1")).toBe(false);
		expect(isTerminalDebugEnabled("stream", "pane-2")).toBe(true);
		expect(isTerminalDebugEnabled("attach", "pane-2")).toBe(false);
	});
});
