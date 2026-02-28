import { describe, expect, it } from "bun:test";
import type { MosaicNode } from "react-mosaic-component";
import type { Tab } from "./types";
import {
	buildMultiPaneLayout,
	findPanePath,
	getAdjacentPaneId,
	resolveActiveTabIdForWorkspace,
	resolveFileViewerMode,
} from "./utils";

// maximizePaneLayout is not yet implemented — issue #1763 (temporarily maximize pane)
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const { maximizePaneLayout } = require("./utils") as any;

describe("findPanePath", () => {
	it("returns empty array for single pane layout matching the id", () => {
		const layout: MosaicNode<string> = "pane-1";
		const result = findPanePath(layout, "pane-1");
		expect(result).toEqual([]);
	});

	it("returns null for single pane layout not matching the id", () => {
		const layout: MosaicNode<string> = "pane-1";
		const result = findPanePath(layout, "pane-2");
		expect(result).toBeNull();
	});

	it("returns correct path for pane in first branch", () => {
		const layout: MosaicNode<string> = {
			direction: "row",
			first: "pane-1",
			second: "pane-2",
		};
		const result = findPanePath(layout, "pane-1");
		expect(result).toEqual(["first"]);
	});

	it("returns correct path for pane in second branch", () => {
		const layout: MosaicNode<string> = {
			direction: "row",
			first: "pane-1",
			second: "pane-2",
		};
		const result = findPanePath(layout, "pane-2");
		expect(result).toEqual(["second"]);
	});

	it("returns correct path for deeply nested pane", () => {
		const layout: MosaicNode<string> = {
			direction: "row",
			first: {
				direction: "column",
				first: "pane-1",
				second: "pane-2",
			},
			second: {
				direction: "column",
				first: "pane-3",
				second: "pane-4",
			},
		};

		expect(findPanePath(layout, "pane-1")).toEqual(["first", "first"]);
		expect(findPanePath(layout, "pane-2")).toEqual(["first", "second"]);
		expect(findPanePath(layout, "pane-3")).toEqual(["second", "first"]);
		expect(findPanePath(layout, "pane-4")).toEqual(["second", "second"]);
	});

	it("returns null for missing pane id in complex layout", () => {
		const layout: MosaicNode<string> = {
			direction: "row",
			first: {
				direction: "column",
				first: "pane-1",
				second: "pane-2",
			},
			second: "pane-3",
		};
		const result = findPanePath(layout, "pane-99");
		expect(result).toBeNull();
	});

	it("handles asymmetric nested layouts", () => {
		const layout: MosaicNode<string> = {
			direction: "row",
			first: "pane-1",
			second: {
				direction: "column",
				first: {
					direction: "row",
					first: "pane-2",
					second: "pane-3",
				},
				second: "pane-4",
			},
		};

		expect(findPanePath(layout, "pane-1")).toEqual(["first"]);
		expect(findPanePath(layout, "pane-2")).toEqual([
			"second",
			"first",
			"first",
		]);
		expect(findPanePath(layout, "pane-3")).toEqual([
			"second",
			"first",
			"second",
		]);
		expect(findPanePath(layout, "pane-4")).toEqual(["second", "second"]);
	});
});

describe("getAdjacentPaneId", () => {
	it("returns null for single pane layout", () => {
		const layout: MosaicNode<string> = "pane-1";
		const result = getAdjacentPaneId(layout, "pane-1");
		expect(result).toBeNull();
	});

	it("returns next pane when closing first pane", () => {
		const layout: MosaicNode<string> = {
			direction: "row",
			first: "pane-1",
			second: "pane-2",
		};
		const result = getAdjacentPaneId(layout, "pane-1");
		expect(result).toBe("pane-2");
	});

	it("returns previous pane when closing last pane", () => {
		const layout: MosaicNode<string> = {
			direction: "row",
			first: "pane-1",
			second: "pane-2",
		};
		const result = getAdjacentPaneId(layout, "pane-2");
		expect(result).toBe("pane-1");
	});

	it("returns next pane when closing middle pane", () => {
		const layout: MosaicNode<string> = {
			direction: "row",
			first: "pane-1",
			second: {
				direction: "row",
				first: "pane-2",
				second: "pane-3",
			},
		};
		// Visual order: pane-1, pane-2, pane-3
		const result = getAdjacentPaneId(layout, "pane-2");
		expect(result).toBe("pane-3");
	});

	it("returns previous pane when closing last in multi-pane layout", () => {
		const layout: MosaicNode<string> = {
			direction: "row",
			first: "pane-1",
			second: {
				direction: "row",
				first: "pane-2",
				second: "pane-3",
			},
		};
		// Visual order: pane-1, pane-2, pane-3
		const result = getAdjacentPaneId(layout, "pane-3");
		expect(result).toBe("pane-2");
	});

	it("returns first pane when closing pane id not found", () => {
		const layout: MosaicNode<string> = {
			direction: "row",
			first: "pane-1",
			second: "pane-2",
		};
		const result = getAdjacentPaneId(layout, "pane-99");
		expect(result).toBe("pane-1");
	});

	it("handles complex nested layouts", () => {
		const layout: MosaicNode<string> = {
			direction: "row",
			first: {
				direction: "column",
				first: "pane-1",
				second: "pane-2",
			},
			second: {
				direction: "column",
				first: "pane-3",
				second: "pane-4",
			},
		};
		// Visual order: pane-1, pane-2, pane-3, pane-4

		expect(getAdjacentPaneId(layout, "pane-1")).toBe("pane-2");
		expect(getAdjacentPaneId(layout, "pane-2")).toBe("pane-3");
		expect(getAdjacentPaneId(layout, "pane-3")).toBe("pane-4");
		expect(getAdjacentPaneId(layout, "pane-4")).toBe("pane-3"); // Last pane goes to previous
	});
});

describe("resolveActiveTabIdForWorkspace", () => {
	const createTab = ({
		id,
		workspaceId,
	}: {
		id: string;
		workspaceId: string;
	}): Tab => {
		return {
			id,
			name: id,
			workspaceId,
			layout: `${id}-pane`,
			createdAt: 0,
		};
	};

	it("returns active tab when valid for workspace", () => {
		const tabs = [
			createTab({ id: "tab-a", workspaceId: "ws-1" }),
			createTab({ id: "tab-b", workspaceId: "ws-1" }),
		];

		expect(
			resolveActiveTabIdForWorkspace({
				workspaceId: "ws-1",
				tabs,
				activeTabIds: { "ws-1": "tab-b" },
				tabHistoryStacks: { "ws-1": ["tab-a"] },
			}),
		).toBe("tab-b");
	});

	it("falls back to MRU history when active tab is invalid", () => {
		const tabs = [
			createTab({ id: "tab-a", workspaceId: "ws-1" }),
			createTab({ id: "tab-b", workspaceId: "ws-1" }),
		];

		expect(
			resolveActiveTabIdForWorkspace({
				workspaceId: "ws-1",
				tabs,
				activeTabIds: { "ws-1": "tab-missing" },
				tabHistoryStacks: { "ws-1": ["tab-b", "tab-a"] },
			}),
		).toBe("tab-b");
	});

	it("ignores history entries from other workspaces", () => {
		const tabs = [
			createTab({ id: "tab-a", workspaceId: "ws-1" }),
			createTab({ id: "tab-c", workspaceId: "ws-2" }),
		];

		expect(
			resolveActiveTabIdForWorkspace({
				workspaceId: "ws-1",
				tabs,
				activeTabIds: { "ws-1": "tab-missing" },
				tabHistoryStacks: { "ws-1": ["tab-c", "tab-a"] },
			}),
		).toBe("tab-a");
	});

	it("falls back to first tab in workspace when no active or valid history", () => {
		const tabs = [
			createTab({ id: "tab-x", workspaceId: "ws-2" }),
			createTab({ id: "tab-a", workspaceId: "ws-1" }),
			createTab({ id: "tab-b", workspaceId: "ws-1" }),
		];

		expect(
			resolveActiveTabIdForWorkspace({
				workspaceId: "ws-1",
				tabs,
				activeTabIds: {},
				tabHistoryStacks: {},
			}),
		).toBe("tab-a");
	});

	it("returns null when workspace has no tabs", () => {
		const tabs = [createTab({ id: "tab-x", workspaceId: "ws-2" })];

		expect(
			resolveActiveTabIdForWorkspace({
				workspaceId: "ws-1",
				tabs,
				activeTabIds: { "ws-1": "tab-x" },
				tabHistoryStacks: { "ws-1": ["tab-x"] },
			}),
		).toBeNull();
	});
});

describe("buildMultiPaneLayout", () => {
	it("throws error for empty pane array", () => {
		expect(() => buildMultiPaneLayout([])).toThrow(
			"Cannot build layout with zero panes",
		);
	});

	it("returns leaf node for single pane", () => {
		const result = buildMultiPaneLayout(["pane-1"]);
		expect(result).toBe("pane-1");
	});

	it("returns horizontal split for two panes", () => {
		const result = buildMultiPaneLayout(["pane-1", "pane-2"]);
		expect(result).toEqual({
			direction: "row",
			first: "pane-1",
			second: "pane-2",
			splitPercentage: 50,
		});
	});

	it("returns balanced grid for three panes", () => {
		const result = buildMultiPaneLayout(["pane-1", "pane-2", "pane-3"]);
		expect(result).toEqual({
			direction: "column",
			first: {
				direction: "row",
				first: "pane-1",
				second: "pane-2",
				splitPercentage: 50,
			},
			second: "pane-3",
			splitPercentage: 50,
		});
	});

	it("returns 2x2 grid for four panes", () => {
		const result = buildMultiPaneLayout([
			"pane-1",
			"pane-2",
			"pane-3",
			"pane-4",
		]);
		expect(result).toEqual({
			direction: "column",
			first: {
				direction: "row",
				first: "pane-1",
				second: "pane-2",
				splitPercentage: 50,
			},
			second: {
				direction: "row",
				first: "pane-3",
				second: "pane-4",
				splitPercentage: 50,
			},
			splitPercentage: 50,
		});
	});

	it("returns balanced nested layout for five panes", () => {
		const result = buildMultiPaneLayout([
			"pane-1",
			"pane-2",
			"pane-3",
			"pane-4",
			"pane-5",
		]);
		expect(result).toEqual({
			direction: "column",
			first: {
				direction: "row",
				first: {
					direction: "row",
					first: "pane-1",
					second: "pane-2",
					splitPercentage: 50,
				},
				second: "pane-3",
				splitPercentage: 50,
			},
			second: {
				direction: "row",
				first: "pane-4",
				second: "pane-5",
				splitPercentage: 50,
			},
			splitPercentage: 50,
		});
	});

	it("returns row-first layout when direction is row", () => {
		const result = buildMultiPaneLayout(["pane-1", "pane-2", "pane-3"], "row");
		expect(result).toEqual({
			direction: "row",
			first: {
				direction: "row",
				first: "pane-1",
				second: "pane-2",
				splitPercentage: 50,
			},
			second: "pane-3",
			splitPercentage: 50,
		});
	});
});

describe("resolveFileViewerMode", () => {
	it("returns diff for modified file with diffCategory", () => {
		expect(
			resolveFileViewerMode({
				filePath: "src/app.ts",
				diffCategory: "unstaged",
				fileStatus: "modified",
			}),
		).toBe("diff");
	});

	it("returns raw for added file with diffCategory", () => {
		expect(
			resolveFileViewerMode({
				filePath: "src/new-file.ts",
				diffCategory: "staged",
				fileStatus: "added",
			}),
		).toBe("raw");
	});

	it("returns raw for untracked file with diffCategory", () => {
		expect(
			resolveFileViewerMode({
				filePath: "src/untracked.ts",
				diffCategory: "unstaged",
				fileStatus: "untracked",
			}),
		).toBe("raw");
	});

	it("returns rendered for added markdown with diffCategory", () => {
		expect(
			resolveFileViewerMode({
				filePath: "docs/README.md",
				diffCategory: "staged",
				fileStatus: "added",
			}),
		).toBe("rendered");
	});

	it("returns diff for renamed file with diffCategory", () => {
		expect(
			resolveFileViewerMode({
				filePath: "src/renamed.ts",
				diffCategory: "committed",
				fileStatus: "renamed",
			}),
		).toBe("diff");
	});

	it("returns diff for copied file with diffCategory", () => {
		expect(
			resolveFileViewerMode({
				filePath: "src/copied.ts",
				diffCategory: "committed",
				fileStatus: "copied",
			}),
		).toBe("diff");
	});

	it("returns diff for deleted file with diffCategory", () => {
		expect(
			resolveFileViewerMode({
				filePath: "src/removed.ts",
				diffCategory: "staged",
				fileStatus: "deleted",
			}),
		).toBe("diff");
	});

	it("returns diff when fileStatus is undefined (backward compat)", () => {
		expect(
			resolveFileViewerMode({
				filePath: "src/file.ts",
				diffCategory: "unstaged",
			}),
		).toBe("diff");
	});

	it("returns raw when no diffCategory and not renderable", () => {
		expect(
			resolveFileViewerMode({
				filePath: "src/file.ts",
			}),
		).toBe("raw");
	});

	it("returns rendered when no diffCategory and file is markdown", () => {
		expect(
			resolveFileViewerMode({
				filePath: "README.md",
			}),
		).toBe("rendered");
	});

	it("returns rendered for image files regardless of other options", () => {
		expect(
			resolveFileViewerMode({
				filePath: "assets/logo.png",
				diffCategory: "unstaged",
				fileStatus: "modified",
			}),
		).toBe("rendered");
	});

	it("respects explicit viewMode override", () => {
		expect(
			resolveFileViewerMode({
				filePath: "src/file.ts",
				diffCategory: "unstaged",
				fileStatus: "added",
				viewMode: "diff",
			}),
		).toBe("diff");
	});
});

// Tests for issue #1763: temporarily maximize pane (tmux-style PREFIX+z toggle)
// These tests describe the expected behavior of a `maximizePaneLayout` utility that
// does not exist yet. They fail to prove the feature is missing.
describe("maximizePaneLayout — issue #1763: temporarily maximize pane", () => {
	it("is exported from utils", () => {
		// Fails because maximizePaneLayout has not been implemented yet
		expect(typeof maximizePaneLayout).toBe("function");
	});

	it("reduces a two-pane layout to just the target pane", () => {
		const layout: MosaicNode<string> = {
			direction: "row",
			first: "pane-1",
			second: "pane-2",
		};
		// When pane-1 is maximized, the visible layout collapses to a single leaf
		expect(maximizePaneLayout(layout, "pane-1")).toBe("pane-1");
	});

	it("reduces a deeply-nested layout to just the target pane", () => {
		const layout: MosaicNode<string> = {
			direction: "row",
			first: {
				direction: "column",
				first: "pane-1",
				second: "pane-2",
			},
			second: "pane-3",
		};
		expect(maximizePaneLayout(layout, "pane-2")).toBe("pane-2");
	});

	it("returns the pane itself when the layout is already a single pane", () => {
		const layout: MosaicNode<string> = "pane-1";
		expect(maximizePaneLayout(layout, "pane-1")).toBe("pane-1");
	});

	it("throws when the target pane is not present in the layout", () => {
		const layout: MosaicNode<string> = {
			direction: "row",
			first: "pane-1",
			second: "pane-2",
		};
		expect(() => maximizePaneLayout(layout, "pane-99")).toThrow();
	});

	it("does not mutate the original layout (restore is lossless)", () => {
		const layout: MosaicNode<string> = {
			direction: "row",
			first: "pane-1",
			second: "pane-2",
		};
		const layoutCopy = JSON.parse(JSON.stringify(layout));
		maximizePaneLayout(layout, "pane-1");
		// Original layout must be unchanged so the caller can restore it
		expect(layout).toEqual(layoutCopy);
	});
});
