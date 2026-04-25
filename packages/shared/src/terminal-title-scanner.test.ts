import { describe, expect, it } from "bun:test";
import {
	createTerminalTitleScanState,
	normalizeTerminalTitle,
	scanForTerminalTitle,
} from "./terminal-title-scanner";

describe("terminal title scanner", () => {
	it("handles OSC 0 and OSC 2 with BEL terminators", () => {
		const state = createTerminalTitleScanState();

		expect(scanForTerminalTitle(state, "\x1b]0;Shell\x07").updates).toEqual([
			"Shell",
		]);
		expect(scanForTerminalTitle(state, "\x1b]2;Editor\x07").updates).toEqual([
			"Editor",
		]);
	});

	it("handles ST terminators", () => {
		const state = createTerminalTitleScanState();

		expect(
			scanForTerminalTitle(state, "\x1b]2;Workspace\x1b\\").updates,
		).toEqual(["Workspace"]);
	});

	it("handles C1 ST terminators", () => {
		const state = createTerminalTitleScanState();

		expect(scanForTerminalTitle(state, "\x1b]2;Workspace\x9c").updates).toEqual(
			["Workspace"],
		);
		expect(scanForTerminalTitle(state, "\x1b]2;Changed\x9c").updates).toEqual([
			"Changed",
		]);
	});

	it("handles C1 OSC introducers", () => {
		const state = createTerminalTitleScanState();

		expect(scanForTerminalTitle(state, "\x9d2;Workspace\x9c").updates).toEqual([
			"Workspace",
		]);
		expect(scanForTerminalTitle(state, "\x9d9;3;Agent\x07").updates).toEqual([
			"Agent",
		]);
	});

	it("handles fragmented OSC sequences", () => {
		const state = createTerminalTitleScanState();

		expect(scanForTerminalTitle(state, "\x1b]2;Work").updates).toEqual([]);
		expect(scanForTerminalTitle(state, "space\x07").updates).toEqual([
			"Workspace",
		]);
	});

	it("handles fragmented OSC introducers and ST terminators", () => {
		const state = createTerminalTitleScanState();

		expect(scanForTerminalTitle(state, "\x1b").updates).toEqual([]);
		expect(scanForTerminalTitle(state, "]0;Split\x1b").updates).toEqual([]);
		expect(scanForTerminalTitle(state, "\\").updates).toEqual(["Split"]);
	});

	it("handles ConEmu tab title and reset sequences", () => {
		const state = createTerminalTitleScanState();

		expect(scanForTerminalTitle(state, "\x1b]9;3;Agent\x07").updates).toEqual([
			"Agent",
		]);
		expect(scanForTerminalTitle(state, "\x1b]9;3;\x07").updates).toEqual([
			null,
		]);
	});

	it("ignores malformed and unsupported payloads", () => {
		const state = createTerminalTitleScanState();

		expect(scanForTerminalTitle(state, "\x1b]9;3\x07").updates).toEqual([]);
		expect(scanForTerminalTitle(state, "\x1b]9;3a\x07").updates).toEqual([]);
		expect(scanForTerminalTitle(state, "\x1b]9;4;Nope\x07").updates).toEqual(
			[],
		);
		expect(scanForTerminalTitle(state, "\x1b]1;Icon\x07").updates).toEqual([]);
	});

	it("returns every title update in a chunk", () => {
		const state = createTerminalTitleScanState();

		expect(
			scanForTerminalTitle(state, "\x1b]0;First\x07text\x1b]2;Second\x07")
				.updates,
		).toEqual(["First", "Second"]);
	});

	it("drops oversized incomplete OSC payloads by UTF-8 byte length", () => {
		const state = createTerminalTitleScanState();

		expect(
			scanForTerminalTitle(state, `\x1b]2;${"🙂".repeat(1024)}`).updates,
		).toEqual([]);
		expect(state.buffer).toBe("");
	});
});

describe("normalizeTerminalTitle", () => {
	it("strips control characters and trims whitespace", () => {
		expect(normalizeTerminalTitle(" \x00Superset\x1b Terminal\t ")).toBe(
			"Superset Terminal",
		);
	});

	it("returns null for empty titles", () => {
		expect(normalizeTerminalTitle(" \x1b\t ")).toBeNull();
	});

	it("truncates long titles without splitting code points", () => {
		const title = `${"a".repeat(199)}🙂extra`;

		expect(Array.from(normalizeTerminalTitle(title) ?? "")).toHaveLength(200);
	});
});
