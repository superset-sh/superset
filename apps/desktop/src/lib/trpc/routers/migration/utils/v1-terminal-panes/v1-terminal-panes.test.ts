import { describe, expect, test } from "bun:test";
import { collectV1TerminalPanes } from "./v1-terminal-panes";

const tabs = (workspaceId: string, paneId: string, cwd: string) => ({
	tabs: [{ id: `tab-${paneId}`, workspaceId }],
	panes: {
		[paneId]: { id: paneId, tabId: `tab-${paneId}`, type: "terminal", cwd },
	},
});

describe("collectV1TerminalPanes", () => {
	test("reads panes saved per window as well as the shared record", () => {
		const panes = collectV1TerminalPanes({
			tabsState: tabs("w-old", "p-old", "/old"),
			tabsStateByWindow: { "window-1": tabs("w-new", "p-new", "/new") },
		});
		expect(panes).toEqual([
			{ paneId: "p-old", v1WorkspaceId: "w-old", cwd: "/old" },
			{ paneId: "p-new", v1WorkspaceId: "w-new", cwd: "/new" },
		]);
	});

	test("a pane in both records is listed once, with the window's copy", () => {
		const panes = collectV1TerminalPanes({
			tabsState: tabs("w", "p", "/before"),
			tabsStateByWindow: { "window-1": tabs("w", "p", "/after") },
		});
		expect(panes).toEqual([{ paneId: "p", v1WorkspaceId: "w", cwd: "/after" }]);
	});
});
