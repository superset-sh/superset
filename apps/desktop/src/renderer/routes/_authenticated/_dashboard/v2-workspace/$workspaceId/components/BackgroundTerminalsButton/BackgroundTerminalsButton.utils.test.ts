import { describe, expect, test } from "bun:test";
import {
	getAttachedTerminalIdsKey,
	getBackgroundTerminalRefetchInterval,
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

	test("polls slowly while closed and fast while open", () => {
		expect(getBackgroundTerminalRefetchInterval(false)).toBe(10_000);
		expect(getBackgroundTerminalRefetchInterval(true)).toBe(2_000);
	});
});
