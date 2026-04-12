import { afterEach, beforeEach, describe, expect, it, mock } from "bun:test";

let oldStateResolver: () => unknown = () => null;
let queryCallCount = 0;

mock.module("renderer/lib/trpc-client", () => ({
	electronTrpcClient: {
		uiState: {
			hotkeys: {
				get: {
					query: async () => {
						queryCallCount++;
						return oldStateResolver();
					},
				},
			},
		},
	},
}));

mock.module("./registry", () => ({
	PLATFORM: "mac" as const,
}));

const storage = new Map<string, string>();
// biome-ignore lint/suspicious/noExplicitAny: test polyfill
(globalThis as any).localStorage = {
	getItem: (key: string) => storage.get(key) ?? null,
	setItem: (key: string, value: string) => {
		storage.set(key, value);
	},
	removeItem: (key: string) => {
		storage.delete(key);
	},
	clear: () => storage.clear(),
};

const { migrateHotkeyOverrides } = await import("./migrate");

const STORE_KEY = "hotkey-overrides";

describe("migrateHotkeyOverrides", () => {
	const originalLog = console.log;

	beforeEach(() => {
		storage.clear();
		queryCallCount = 0;
		oldStateResolver = () => null;
		console.log = mock(() => undefined);
	});

	afterEach(() => {
		console.log = originalLog;
	});

	it("skips when the migrated sentinel is already set", async () => {
		storage.set("hotkey-overrides-migrated", "1");

		await migrateHotkeyOverrides();

		expect(queryCallCount).toBe(0);
	});

	it("skips when the old state has no overrides for the current platform", async () => {
		oldStateResolver = () => ({
			version: 1,
			byPlatform: { darwin: {}, win32: {}, linux: {} },
		});

		await migrateHotkeyOverrides();

		expect(queryCallCount).toBe(1);
		expect(storage.get(STORE_KEY)).toBeUndefined();
	});

	it("writes old overrides into the new store format", async () => {
		oldStateResolver = () => ({
			version: 1,
			byPlatform: {
				darwin: {
					NEW_GROUP: "meta+shift+t",
					CLOSE_PANE: null,
				},
				win32: { NEW_GROUP: "ctrl+shift+t" },
				linux: {},
			},
		});

		await migrateHotkeyOverrides();

		const written = JSON.parse(storage.get(STORE_KEY) ?? "null");
		expect(written).toEqual({
			state: {
				overrides: {
					NEW_GROUP: "meta+shift+t",
					CLOSE_PANE: null,
				},
			},
			version: 0,
		});
	});

	it("swallows tRPC errors without throwing or writing", async () => {
		oldStateResolver = () => {
			throw new Error("boom");
		};

		await migrateHotkeyOverrides();

		expect(storage.get(STORE_KEY)).toBeUndefined();
	});

	it("runs the tRPC query exactly once even when there are no overrides", async () => {
		oldStateResolver = () => ({
			version: 1,
			byPlatform: { darwin: {}, win32: {}, linux: {} },
		});

		await migrateHotkeyOverrides();
		await migrateHotkeyOverrides();
		await migrateHotkeyOverrides();

		expect(queryCallCount).toBe(1);
	});

	it("translates punctuation key-strings to the new registry's code-based names", async () => {
		oldStateResolver = () => ({
			version: 1,
			byPlatform: {
				darwin: {
					NAVIGATE_BACK: "meta+[",
					NAVIGATE_FORWARD: "meta+]",
					OPEN_SETTINGS: "meta+,",
					OPEN_SHORTCUTS: "meta+shift+/",
				},
				win32: {},
				linux: {},
			},
		});

		await migrateHotkeyOverrides();

		const written = JSON.parse(storage.get(STORE_KEY) ?? "null");
		expect(written.state.overrides).toEqual({
			NAVIGATE_BACK: "meta+bracketleft",
			NAVIGATE_FORWARD: "meta+bracketright",
			OPEN_SETTINGS: "meta+comma",
			OPEN_SHORTCUTS: "meta+shift+slash",
		});
	});
});
