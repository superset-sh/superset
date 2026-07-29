import { describe, expect, test } from "bun:test";
import {
	pruneExpiredTerminalState,
	removeTerminalStatePersistedAt,
	TERMINAL_BUFFER_KEY_PREFIX,
	TERMINAL_DIMS_KEY_PREFIX,
	TERMINAL_PERSISTED_AT_KEY,
	touchTerminalStatePersistedAt,
} from "./terminal-buffer-gc";

const DAY_MS = 24 * 60 * 60 * 1000;
const NOW = 1_800_000_000_000;

function createFakeStorage(): {
	values: Map<string, string>;
	storage: Storage;
} {
	const values = new Map<string, string>();
	const storage = {
		get length() {
			return values.size;
		},
		clear: () => values.clear(),
		getItem: (key: string) => values.get(key) ?? null,
		key: (index: number) => Array.from(values.keys())[index] ?? null,
		removeItem: (key: string) => values.delete(key),
		setItem: (key: string, value: string) => values.set(key, value),
	} as Storage;
	return { values, storage };
}

function seedTerminal(
	values: Map<string, string>,
	terminalId: string,
	buffer = "scrollback",
) {
	values.set(`${TERMINAL_BUFFER_KEY_PREFIX}${terminalId}`, buffer);
	values.set(
		`${TERMINAL_DIMS_KEY_PREFIX}${terminalId}`,
		JSON.stringify({ cols: 120, rows: 32 }),
	);
}

function readIndex(values: Map<string, string>): Record<string, number> {
	const raw = values.get(TERMINAL_PERSISTED_AT_KEY);
	return raw ? JSON.parse(raw) : {};
}

describe("pruneExpiredTerminalState", () => {
	test("removes entries with no persisted-at stamp", () => {
		const { values, storage } = createFakeStorage();
		seedTerminal(values, "legacy");
		values.set("unrelated-key", "kept");

		pruneExpiredTerminalState(storage, NOW);

		expect(values.has(`${TERMINAL_BUFFER_KEY_PREFIX}legacy`)).toBe(false);
		expect(values.has(`${TERMINAL_DIMS_KEY_PREFIX}legacy`)).toBe(false);
		expect(values.get("unrelated-key")).toBe("kept");
	});

	test("keeps fresh entries and removes ones older than the TTL", () => {
		const { values, storage } = createFakeStorage();
		seedTerminal(values, "fresh");
		seedTerminal(values, "stale");
		touchTerminalStatePersistedAt("fresh", storage, NOW - 1 * DAY_MS);
		touchTerminalStatePersistedAt("stale", storage, NOW - 15 * DAY_MS);

		pruneExpiredTerminalState(storage, NOW);

		expect(values.has(`${TERMINAL_BUFFER_KEY_PREFIX}fresh`)).toBe(true);
		expect(values.has(`${TERMINAL_DIMS_KEY_PREFIX}fresh`)).toBe(true);
		expect(values.has(`${TERMINAL_BUFFER_KEY_PREFIX}stale`)).toBe(false);
		expect(values.has(`${TERMINAL_DIMS_KEY_PREFIX}stale`)).toBe(false);
		expect(Object.keys(readIndex(values))).toEqual(["fresh"]);
	});

	test("evicts oldest entries once buffers exceed the size budget", () => {
		const { values, storage } = createFakeStorage();
		const big = "x".repeat(900_000);
		for (const [id, ageDays] of [
			["newest", 1],
			["middle", 2],
			["oldest", 3],
		] as const) {
			seedTerminal(values, id, big);
			touchTerminalStatePersistedAt(id, storage, NOW - ageDays * DAY_MS);
		}

		pruneExpiredTerminalState(storage, NOW);

		expect(values.has(`${TERMINAL_BUFFER_KEY_PREFIX}newest`)).toBe(true);
		expect(values.has(`${TERMINAL_BUFFER_KEY_PREFIX}middle`)).toBe(true);
		expect(values.has(`${TERMINAL_BUFFER_KEY_PREFIX}oldest`)).toBe(false);
		expect(values.has(`${TERMINAL_DIMS_KEY_PREFIX}oldest`)).toBe(false);
	});

	test("drops index rows whose storage keys are gone", () => {
		const { values, storage } = createFakeStorage();
		seedTerminal(values, "live");
		touchTerminalStatePersistedAt("live", storage, NOW);
		touchTerminalStatePersistedAt("ghost", storage, NOW);
		values.delete(`${TERMINAL_BUFFER_KEY_PREFIX}ghost`);

		pruneExpiredTerminalState(storage, NOW);

		expect(Object.keys(readIndex(values))).toEqual(["live"]);
	});

	test("prunes a dims key whose buffer never persisted", () => {
		const { values, storage } = createFakeStorage();
		values.set(
			`${TERMINAL_DIMS_KEY_PREFIX}dims-only`,
			JSON.stringify({ cols: 80, rows: 24 }),
		);

		pruneExpiredTerminalState(storage, NOW);

		expect(values.has(`${TERMINAL_DIMS_KEY_PREFIX}dims-only`)).toBe(false);
	});
});

describe("persisted-at index maintenance", () => {
	test("touch stamps and remove deletes a terminal's entry", () => {
		const { values, storage } = createFakeStorage();

		touchTerminalStatePersistedAt("t1", storage, NOW);
		expect(readIndex(values)).toEqual({ t1: NOW });

		removeTerminalStatePersistedAt("t1", storage);
		expect(readIndex(values)).toEqual({});
	});

	test("touch survives a corrupt index blob", () => {
		const { values, storage } = createFakeStorage();
		values.set(TERMINAL_PERSISTED_AT_KEY, "not-json");

		touchTerminalStatePersistedAt("t1", storage, NOW);

		expect(readIndex(values)).toEqual({ t1: NOW });
	});
});
