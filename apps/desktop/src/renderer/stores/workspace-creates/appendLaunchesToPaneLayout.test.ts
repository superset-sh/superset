import { describe, expect, it } from "bun:test";
import { appendLaunchesToPaneLayout } from "./appendLaunchesToPaneLayout";

describe("appendLaunchesToPaneLayout", () => {
	it("adds one tab per terminal and agent launch", () => {
		const state = appendLaunchesToPaneLayout({
			existing: undefined,
			terminals: [{ terminalId: "term-1", label: "Workspace Setup" }],
			agents: [
				{ ok: true, kind: "terminal", sessionId: "term-2", label: "Claude" },
			],
		});

		expect(state.tabs).toHaveLength(2);
		expect(state.tabs.map((tab) => tab.titleOverride)).toEqual([
			"Workspace Setup",
			"Claude",
		]);
	});

	it("dedupes a chained agent that reuses the setup terminal to one tab", () => {
		const state = appendLaunchesToPaneLayout({
			existing: undefined,
			terminals: [{ terminalId: "term-1", label: "Workspace Setup" }],
			agents: [
				{ ok: true, kind: "terminal", sessionId: "term-1", label: "Claude" },
			],
		});

		expect(state.tabs).toHaveLength(1);
		expect(state.tabs[0].titleOverride).toBe("Workspace Setup");
	});

	it("skips failed agent launches", () => {
		const state = appendLaunchesToPaneLayout({
			existing: undefined,
			terminals: [],
			agents: [{ ok: false, error: "boom" }],
		});

		expect(state.tabs).toHaveLength(0);
	});

	it("leaves a chat launch to the chat pane instead of a terminal tab", () => {
		const state = appendLaunchesToPaneLayout({
			existing: undefined,
			terminals: [],
			agents: [
				{
					ok: true,
					kind: "terminal",
					sessionId: "terminal-1",
					label: "Claude",
					chatSessionId: "chat-1",
				},
			],
		});

		expect(state.tabs).toHaveLength(0);
	});
});
