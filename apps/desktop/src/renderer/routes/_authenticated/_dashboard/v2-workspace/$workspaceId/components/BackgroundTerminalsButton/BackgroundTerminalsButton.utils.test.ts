import { describe, expect, test } from "bun:test";
import {
	getAttachedTerminalIdsKey,
	getAutoAttachBackgroundTerminalId,
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

	test("auto-attaches the newest live background session when no attached terminal is live", () => {
		expect(
			getAutoAttachBackgroundTerminalId({
				sessions: [
					{ terminalId: "old-live", createdAt: 1 },
					{ terminalId: "exited-newer", createdAt: 10, exited: true },
					{ terminalId: "new-live", createdAt: 5 },
				],
				attachedTerminalIds: [],
			}),
		).toBe("new-live");
	});

	test("does not auto-attach when an attached terminal is already live", () => {
		expect(
			getAutoAttachBackgroundTerminalId({
				sessions: [
					{ terminalId: "attached", createdAt: 1 },
					{ terminalId: "background", createdAt: 5 },
				],
				attachedTerminalIds: ["attached"],
			}),
		).toBeNull();
	});

	test("can prefer a newer titled background session over an older untitled attached session", () => {
		expect(
			getAutoAttachBackgroundTerminalId({
				sessions: [
					{ terminalId: "blank-attached", createdAt: 1, title: null },
					{
						terminalId: "remote-claude",
						createdAt: 5,
						title: "claude --dangerously-skip-permissions",
					},
				],
				attachedTerminalIds: ["blank-attached"],
				preferTitledBackgroundOverUntitledAttached: true,
			}),
		).toBe("remote-claude");
	});

	test("does not replace a titled attached terminal with a background session", () => {
		expect(
			getAutoAttachBackgroundTerminalId({
				sessions: [
					{ terminalId: "active-shell", createdAt: 1, title: "zsh" },
					{ terminalId: "remote-claude", createdAt: 5, title: "claude" },
				],
				attachedTerminalIds: ["active-shell"],
				preferTitledBackgroundOverUntitledAttached: true,
			}),
		).toBeNull();
	});

	test("can auto-attach when local layout points at a stale terminal id", () => {
		expect(
			getAutoAttachBackgroundTerminalId({
				sessions: [{ terminalId: "remote-live", createdAt: 5 }],
				attachedTerminalIds: ["stale-local"],
			}),
		).toBe("remote-live");
	});

	test("skips sessions that were intentionally backgrounded on this client", () => {
		expect(
			getAutoAttachBackgroundTerminalId({
				sessions: [{ terminalId: "backgrounded-here", createdAt: 5 }],
				attachedTerminalIds: [],
				suppressedTerminalIds: ["backgrounded-here"],
			}),
		).toBeNull();
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
});
