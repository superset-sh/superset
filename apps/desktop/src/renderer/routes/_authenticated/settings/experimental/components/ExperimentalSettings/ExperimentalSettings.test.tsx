import { describe, expect, mock, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";

// The zustand persist stores read the global localStorage; give them a
// working in-memory one before anything imports them.
const backing = new Map<string, string>();
globalThis.localStorage = {
	getItem: (key: string) => backing.get(key) ?? null,
	setItem: (key: string, value: string) => void backing.set(key, value),
	removeItem: (key: string) => void backing.delete(key),
	clear: () => backing.clear(),
	key: (index: number) => [...backing.keys()][index] ?? null,
	get length() {
		return backing.size;
	},
} as Storage;

// Owns electronTrpc queries; irrelevant to what this file asserts.
mock.module("./components/WaitForSetupBeforeAgentSetting", () => ({
	WaitForSetupBeforeAgentSetting: () => null,
}));

const { ExperimentalSettings } = await import("./ExperimentalSettings");

describe("ExperimentalSettings", () => {
	test("offers the v1 importer as the recovery path", () => {
		const markup = renderToStaticMarkup(<ExperimentalSettings />);
		expect(markup).toContain("Import from v1");
		expect(markup).toContain("Open importer");
	});
});
