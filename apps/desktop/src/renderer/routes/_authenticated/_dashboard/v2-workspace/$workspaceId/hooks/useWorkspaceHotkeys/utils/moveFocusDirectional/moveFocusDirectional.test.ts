import { describe, expect, it } from "bun:test";
import {
	createWorkspaceStore,
	type LayoutNode,
	type WorkspaceState,
} from "@superset/panes";
import type { PaneViewerData } from "../../../../types";
import {
	moveFocusDirectional,
	type PaneTerminalFocuser,
} from "./moveFocusDirectional";

function terminalPane(id: string, terminalId: string) {
	return {
		id,
		kind: "terminal",
		data: { terminalId } as PaneViewerData,
	};
}

// tab with two terminals split side by side (pane-left | pane-right),
// matching the issue's repro: terminal A on the left, terminal B on the right.
function sideBySideState(): WorkspaceState<PaneViewerData> {
	const layout: LayoutNode = {
		type: "split",
		direction: "horizontal",
		first: { type: "pane", paneId: "pane-left" },
		second: { type: "pane", paneId: "pane-right" },
	};
	return {
		version: 1,
		activeTabId: "tab-1",
		tabs: [
			{
				id: "tab-1",
				createdAt: 1,
				activePaneId: "pane-left",
				layout,
				panes: {
					"pane-left": terminalPane("pane-left", "terminal-A"),
					"pane-right": terminalPane("pane-right", "terminal-B"),
				},
			},
		],
	};
}

function recordingFocuser() {
	const focused: Array<{ terminalId: string; terminalInstanceId: string }> = [];
	const focuser: PaneTerminalFocuser = {
		focusTerminal(terminalId, terminalInstanceId) {
			focused.push({ terminalId, terminalInstanceId });
		},
	};
	return { focuser, focused };
}

describe("moveFocusDirectional", () => {
	it("updates the active-pane highlight to the neighbor", () => {
		const store = createWorkspaceStore<PaneViewerData>({
			initialState: sideBySideState(),
		});
		const { focuser } = recordingFocuser();

		moveFocusDirectional(store, "right", focuser);

		expect(store.getState().getTab("tab-1")?.activePaneId).toBe("pane-right");
	});

	// The bug (issue #5052): FOCUS_PANE_* updated the highlight but never moved
	// keyboard focus onto the neighbor terminal's xterm instance, so typing kept
	// going to the previously focused terminal until the user clicked the pane.
	it("moves keyboard focus to the neighbor terminal", () => {
		const store = createWorkspaceStore<PaneViewerData>({
			initialState: sideBySideState(),
		});
		const { focuser, focused } = recordingFocuser();

		moveFocusDirectional(store, "right", focuser);

		expect(focused).toEqual([
			{ terminalId: "terminal-B", terminalInstanceId: "pane-right" },
		]);
	});

	it("does nothing when there is no neighbor in the requested direction", () => {
		const store = createWorkspaceStore<PaneViewerData>({
			initialState: sideBySideState(),
		});
		const { focuser, focused } = recordingFocuser();

		// Already at the left edge — nothing further left.
		moveFocusDirectional(store, "left", focuser);

		expect(store.getState().getTab("tab-1")?.activePaneId).toBe("pane-left");
		expect(focused).toEqual([]);
	});
});
