import { afterAll, afterEach, describe, expect, test } from "bun:test";
import { GlobalRegistrator } from "@happy-dom/global-registrator";
import {
	createWorkspaceStore,
	type LayoutNode,
	type WorkspaceState,
} from "@superset/panes";
import type { DiffPaneData, PaneViewerData } from "../../types";

// happy-dom over the preloaded plain-object document. Process-wide, so this
// unregisters in afterAll to leave the other renderer suites their document.
const alreadyRegistered = GlobalRegistrator.isRegistered;
if (!alreadyRegistered) GlobalRegistrator.register();
(
	globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

const { act, cleanup, renderHook } = await import("@testing-library/react");
const { useDiffPaneTarget } = await import("./useDiffPaneTarget");

afterEach(cleanup);
afterAll(async () => {
	if (!alreadyRegistered) await GlobalRegistrator.unregister();
});

function paneLayout(paneId: string): LayoutNode {
	return { type: "pane", paneId };
}

/** One tab: a terminal pane beside a diff pane, the diff pane focused. */
function storeWithDiffFocused() {
	const state: WorkspaceState<PaneViewerData> = {
		version: 1,
		activeTabId: "tab-1",
		tabs: [
			{
				id: "tab-1",
				createdAt: 1,
				activePaneId: "diff-pane",
				layout: {
					type: "split",
					direction: "horizontal",
					first: paneLayout("pane-1"),
					second: paneLayout("diff-pane"),
				},
				panes: {
					"pane-1": {
						id: "pane-1",
						kind: "terminal",
						data: { terminalId: "terminal-1" } as PaneViewerData,
					},
					"diff-pane": {
						id: "diff-pane",
						kind: "diff",
						data: {
							path: "src/app.ts",
							changeKey: "unstaged:src/app.ts",
							collapsedFiles: [],
						} as DiffPaneData,
					},
				},
			},
		],
	};
	return createWorkspaceStore<PaneViewerData>({ initialState: state });
}

describe("useDiffPaneTarget", () => {
	test("reports the focused diff pane's target", () => {
		const store = storeWithDiffFocused();
		const { result } = renderHook(() => useDiffPaneTarget(store));

		expect(result.current).toEqual({
			path: "src/app.ts",
			changeKey: "unstaged:src/app.ts",
		});
	});

	test("holds the target while a terminal pane has focus", () => {
		const store = storeWithDiffFocused();
		const { result } = renderHook(() => useDiffPaneTarget(store));

		act(() => {
			store.getState().setActivePane({ tabId: "tab-1", paneId: "pane-1" });
		});

		expect(result.current?.path).toBe("src/app.ts");
	});

	test("clears when the focused diff pane releases its path", () => {
		// collapse-all writes an empty path to release the sticky scroll
		// target; the sidebar highlight must go with it.
		const store = storeWithDiffFocused();
		const { result } = renderHook(() => useDiffPaneTarget(store));

		act(() => {
			store.getState().setPaneData({
				paneId: "diff-pane",
				data: {
					path: "",
					changeKey: undefined,
					collapsedFiles: ["unstaged:src/app.ts"],
				} as PaneViewerData,
			});
		});

		expect(result.current).toBeUndefined();
	});

	test("clears once no diff pane remains", () => {
		const store = storeWithDiffFocused();
		const { result } = renderHook(() => useDiffPaneTarget(store));

		act(() => {
			store.getState().closePane({ tabId: "tab-1", paneId: "diff-pane" });
		});

		expect(result.current).toBeUndefined();
	});
});
