import { afterAll, beforeEach, describe, expect, it } from "bun:test";
import { mkdtempSync, rmSync, unlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
	loadWindowStateForKey,
	saveWindowStateForKey,
	type WindowState,
} from "./window-state";

const TEST_DIR = mkdtempSync(join(tmpdir(), "superset-window-state-"));
const STATE_PATH = join(TEST_DIR, "window-state.json");

const VALID_STATE: WindowState = {
	x: 10,
	y: 20,
	width: 800,
	height: 600,
	isMaximized: false,
	zoomLevel: 1,
};

beforeEach(() => {
	try {
		unlinkSync(STATE_PATH);
	} catch {
		// not created yet
	}
});

afterAll(() => {
	rmSync(TEST_DIR, { recursive: true, force: true });
});

describe("loadWindowStateForKey", () => {
	it("returns null when no file exists", () => {
		expect(loadWindowStateForKey("ws-1", STATE_PATH)).toBeNull();
	});

	it("round-trips state for a key", () => {
		saveWindowStateForKey("ws-1", VALID_STATE, STATE_PATH);
		expect(loadWindowStateForKey("ws-1", STATE_PATH)).toEqual(VALID_STATE);
	});

	it("does NOT fall back to the default slot for unknown keys", () => {
		saveWindowStateForKey("default", VALID_STATE, STATE_PATH);
		expect(loadWindowStateForKey("ws-never-seen", STATE_PATH)).toBeNull();
	});

	it("keeps entries for different keys independent", () => {
		const other: WindowState = { ...VALID_STATE, width: 1024 };
		saveWindowStateForKey("ws-1", VALID_STATE, STATE_PATH);
		saveWindowStateForKey("ws-2", other, STATE_PATH);
		expect(loadWindowStateForKey("ws-1", STATE_PATH)).toEqual(VALID_STATE);
		expect(loadWindowStateForKey("ws-2", STATE_PATH)).toEqual(other);
	});

	it("returns null for corrupt JSON", () => {
		writeFileSync(STATE_PATH, "{not json", "utf-8");
		expect(loadWindowStateForKey("ws-1", STATE_PATH)).toBeNull();
	});

	it("filters invalid entries from the map", () => {
		writeFileSync(
			STATE_PATH,
			JSON.stringify({ "ws-1": VALID_STATE, "ws-bad": { x: "nope" } }),
			"utf-8",
		);
		expect(loadWindowStateForKey("ws-1", STATE_PATH)).toEqual(VALID_STATE);
		expect(loadWindowStateForKey("ws-bad", STATE_PATH)).toBeNull();
	});
});

describe("legacy single-state migration", () => {
	it("reads a legacy bare WindowState file as the default key", () => {
		writeFileSync(STATE_PATH, JSON.stringify(VALID_STATE), "utf-8");
		expect(loadWindowStateForKey("default", STATE_PATH)).toEqual(VALID_STATE);
	});

	it("preserves the legacy state under default when saving a new key", () => {
		writeFileSync(STATE_PATH, JSON.stringify(VALID_STATE), "utf-8");
		const other: WindowState = { ...VALID_STATE, x: 99 };
		saveWindowStateForKey("ws-1", other, STATE_PATH);
		expect(loadWindowStateForKey("default", STATE_PATH)).toEqual(VALID_STATE);
		expect(loadWindowStateForKey("ws-1", STATE_PATH)).toEqual(other);
	});
});

describe("saveWindowStateForKey", () => {
	it("preserves other keys on save", () => {
		saveWindowStateForKey("ws-1", VALID_STATE, STATE_PATH);
		saveWindowStateForKey("ws-2", { ...VALID_STATE, y: 77 }, STATE_PATH);
		saveWindowStateForKey("ws-1", { ...VALID_STATE, x: 1 }, STATE_PATH);
		expect(loadWindowStateForKey("ws-2", STATE_PATH)?.y).toBe(77);
		expect(loadWindowStateForKey("ws-1", STATE_PATH)?.x).toBe(1);
	});

	it("recovers from a corrupt file by starting a fresh map", () => {
		writeFileSync(STATE_PATH, "garbage", "utf-8");
		saveWindowStateForKey("ws-1", VALID_STATE, STATE_PATH);
		expect(loadWindowStateForKey("ws-1", STATE_PATH)).toEqual(VALID_STATE);
	});
});
