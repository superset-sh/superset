import { describe, expect, it } from "bun:test";
import {
	consumeTerminalBackgroundIntent,
	getTerminalBackgroundMarkerIdsKey,
} from "renderer/lib/terminal/terminal-background-intents";
import {
	getTerminalDisplayTitle,
	getTerminalSessionListRefetchInterval,
	sendTerminalToBackground,
	shouldQueryTerminalSessionList,
	TERMINAL_SESSION_LIST_REFETCH_INTERVAL_MS,
} from "./TerminalSessionDropdown.utils";

describe("TerminalSessionDropdown query policy", () => {
	it("does not query or poll while closed", () => {
		expect(shouldQueryTerminalSessionList(false)).toBe(false);
		expect(getTerminalSessionListRefetchInterval(false)).toBe(false);
	});

	it("queries and polls while open", () => {
		expect(shouldQueryTerminalSessionList(true)).toBe(true);
		expect(getTerminalSessionListRefetchInterval(true)).toBe(
			TERMINAL_SESSION_LIST_REFETCH_INTERVAL_MS,
		);
	});

	it("keeps closed dropdowns cold under tab churn", () => {
		for (let i = 0; i < 10_000; i++) {
			expect(shouldQueryTerminalSessionList(false)).toBe(false);
			expect(getTerminalSessionListRefetchInterval(false)).toBe(false);
		}
	});
});

describe("getTerminalDisplayTitle", () => {
	it("prefers explicit pane title overrides over runtime titles", () => {
		expect(
			getTerminalDisplayTitle({
				titleOverride: "echo sequence",
				runtimeTitle: "Terminal",
				sessionTitle: "zsh",
			}),
		).toBe("echo sequence");
	});

	it("falls back through runtime, session, and default titles", () => {
		expect(getTerminalDisplayTitle({ runtimeTitle: "vim" })).toBe("vim");
		expect(getTerminalDisplayTitle({ sessionTitle: "zsh" })).toBe("zsh");
		expect(getTerminalDisplayTitle({})).toBe("Terminal");
	});
});

describe("sendTerminalToBackground", () => {
	it("registers the release intent and workspace marker, then closes the pane", () => {
		let closed = 0;
		sendTerminalToBackground(
			{ terminalId: "term-bg-1", workspaceId: "ws-bg-1" },
			{
				close: () => {
					closed += 1;
				},
			},
		);

		// The pane close is requested so the tab/pane is removed.
		expect(closed).toBe(1);

		// The workspace marker is registered so the Background Terminals button
		// optimistically surfaces the session right away.
		expect(getTerminalBackgroundMarkerIdsKey("ws-bg-1")).toContain("term-bg-1");

		// onAfterClose consumes the intent and takes the release (keep-running)
		// branch instead of disposing + killing the session.
		expect(consumeTerminalBackgroundIntent("term-bg-1")).toBe(true);
		// The intent is one-shot: a later close without re-marking would kill.
		expect(consumeTerminalBackgroundIntent("term-bg-1")).toBe(false);
	});

	it("does not mark unrelated terminals for background", () => {
		sendTerminalToBackground(
			{ terminalId: "term-bg-2", workspaceId: "ws-bg-2" },
			{ close: () => {} },
		);

		expect(consumeTerminalBackgroundIntent("term-other")).toBe(false);
		expect(getTerminalBackgroundMarkerIdsKey("ws-bg-2")).not.toContain(
			"term-other",
		);
	});
});
