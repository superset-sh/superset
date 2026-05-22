import { describe, expect, test } from "bun:test";
import {
	adoptBackgroundTerminal,
	getAttachedTerminalIdsKey,
	getBackgroundTerminalCountRefetchInterval,
	getBackgroundTerminalListRefetchInterval,
	getBackgroundTerminalSessions,
	getUnattachedTerminalIds,
	parseAttachedTerminalIdsKey,
} from "./BackgroundTerminalsButton.utils";

describe("BackgroundTerminalsButton utils", () => {
	test("keeps the attached terminal key stable across tab object churn", () => {
		type WorkspaceTabs = Parameters<typeof getAttachedTerminalIdsKey>[0];
		const makeTabs = (): WorkspaceTabs => [
			{
				panes: {
					a: { kind: "terminal", data: { terminalId: "term-b" } },
					b: { kind: "browser", data: { terminalId: "ignored" } },
				},
			},
			{
				panes: {
					c: { kind: "terminal", data: { terminalId: "term-a" } },
				},
			},
		];
		const firstKey = getAttachedTerminalIdsKey(makeTabs());

		for (let i = 0; i < 10_000; i += 1) {
			expect(getAttachedTerminalIdsKey(makeTabs())).toBe(firstKey);
		}
		expect(parseAttachedTerminalIdsKey(firstKey)).toEqual(["term-a", "term-b"]);
	});

	test("filters attached sessions and sorts background sessions newest first", () => {
		expect(
			getBackgroundTerminalSessions(
				[
					{ terminalId: "old", createdAt: 1 },
					{ terminalId: "attached", createdAt: 3 },
					{ terminalId: "new", createdAt: 5 },
				],
				["attached"],
			).map((session) => session.terminalId),
		).toEqual(["new", "old"]);
	});

	test("deduplicates optimistic background terminal markers and ignores attached terminals", () => {
		expect(
			getUnattachedTerminalIds(["term-b", "term-a", "term-b"], ["term-a"]),
		).toEqual(["term-b"]);
	});

	test("uses shallow count polling only while closed", () => {
		expect(getBackgroundTerminalCountRefetchInterval(false)).toBe(10_000);
		expect(getBackgroundTerminalCountRefetchInterval(true)).toBe(false);
		expect(getBackgroundTerminalListRefetchInterval(false)).toBe(false);
		expect(getBackgroundTerminalListRefetchInterval(true)).toBe(2_000);
	});

	test("adoption closes the dropdown before mounting the terminal pane (#4811)", () => {
		const calls: string[] = [];
		const scheduledRef: { current: (() => void) | null } = { current: null };

		adoptBackgroundTerminal({
			clearMarker: () => calls.push("clearMarker"),
			closeDropdown: () => calls.push("closeDropdown"),
			addTab: () => calls.push("addTab"),
			invalidateQueries: () => calls.push("invalidateQueries"),
			logEvent: () => calls.push("logEvent"),
			scheduleFrame: (callback) => {
				calls.push("scheduleFrame");
				scheduledRef.current = callback;
			},
		});

		// Before the next frame, the dropdown is closed but addTab has NOT yet run.
		// This is the fix for #4811: if addTab fires while the dropdown is still
		// open, TerminalPane mounts into a zero-dimension host, fitAddon.fit() is
		// skipped, and the terminal viewport stays stuck.
		expect(calls).toEqual(["clearMarker", "closeDropdown", "scheduleFrame"]);
		expect(calls.indexOf("closeDropdown")).toBeLessThan(
			calls.indexOf("scheduleFrame"),
		);

		// Flush the scheduled frame — addTab now runs with a stable layout.
		scheduledRef.current?.();
		expect(calls).toEqual([
			"clearMarker",
			"closeDropdown",
			"scheduleFrame",
			"addTab",
			"invalidateQueries",
			"logEvent",
		]);
	});

	test("adoption falls back to setTimeout when requestAnimationFrame is absent", () => {
		const calls: string[] = [];
		adoptBackgroundTerminal({
			clearMarker: () => calls.push("clearMarker"),
			closeDropdown: () => calls.push("closeDropdown"),
			addTab: () => calls.push("addTab"),
			invalidateQueries: () => calls.push("invalidateQueries"),
			logEvent: () => calls.push("logEvent"),
			scheduleFrame: (callback) => {
				calls.push("scheduleFrame");
				callback();
			},
		});

		expect(calls).toEqual([
			"clearMarker",
			"closeDropdown",
			"scheduleFrame",
			"addTab",
			"invalidateQueries",
			"logEvent",
		]);
	});
});
