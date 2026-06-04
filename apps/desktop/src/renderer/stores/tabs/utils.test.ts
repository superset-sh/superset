import { describe, expect, it } from "bun:test";
import type { MosaicNode } from "react-mosaic-component";
import type { Pane, Tab } from "./types";
import {
	activatePaneInWorkspace,
	applyFileViewerOpenOptionsToPane,
	buildMultiPaneLayout,
	createChatPane,
	fileViewerTargetsMatch,
	findPanePath,
	findReusableFileViewerPane,
	getAdjacentPaneId,
	resolveActiveTabIdForWorkspace,
	resolveFileViewerMode,
} from "./utils";

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

describe("findReusableFileViewerPane", () => {
	const createTab = (
		id: string,
		workspaceId: string,
		layout: MosaicNode<string>,
	): Tab => {
		return {
			id,
			name: id,
			workspaceId,
			layout,
			createdAt: 0,
		};
	};

	const createFileViewerPane = (
		id: string,
		tabId: string,
		filePath: string,
	): Pane => {
		return {
			id,
			tabId,
			type: "file-viewer",
			name: filePath.split("/").at(-1) ?? filePath,
			fileViewer: {
				filePath,
				viewMode: "diff",
				isPinned: true,
				diffLayout: "inline",
				diffCategory: "unstaged",
			},
		};
	};

	it("reuses matching panes across the workspace", () => {
		const tabs = [
			createTab("tab-a", "ws-1", "pane-a"),
			createTab("tab-b", "ws-1", "pane-b"),
		];
		const panes = {
			"pane-a": createFileViewerPane("pane-a", "tab-a", "/repo/other.ts"),
			"pane-b": createFileViewerPane("pane-b", "tab-b", "/repo/file.ts"),
		};

		const result = findReusableFileViewerPane({
			workspaceId: "ws-1",
			activeTabId: "tab-a",
			tabs,
			panes,
			tabHistoryStacks: { "ws-1": [] },
			reuseExisting: "workspace",
			options: {
				filePath: "/repo/file.ts",
				diffCategory: "unstaged",
			},
		});

		expect(result?.id).toBe("pane-b");
	});

	it("limits reuse to the active tab when requested", () => {
		const tabs = [
			createTab("tab-a", "ws-1", "pane-a"),
			createTab("tab-b", "ws-1", "pane-b"),
		];
		const panes = {
			"pane-a": createFileViewerPane("pane-a", "tab-a", "/repo/other.ts"),
			"pane-b": createFileViewerPane("pane-b", "tab-b", "/repo/file.ts"),
		};

		const result = findReusableFileViewerPane({
			workspaceId: "ws-1",
			activeTabId: "tab-a",
			tabs,
			panes,
			tabHistoryStacks: { "ws-1": [] },
			reuseExisting: "active-tab",
			options: {
				filePath: "/repo/file.ts",
				diffCategory: "unstaged",
			},
		});

		expect(result).toBeNull();
	});

	it("prefers more recently used matching tabs when duplicates already exist", () => {
		const tabs = [
			createTab("tab-a", "ws-1", "pane-a"),
			createTab("tab-b", "ws-1", "pane-b"),
			createTab("tab-c", "ws-1", "pane-c"),
		];
		const panes = {
			"pane-a": createFileViewerPane("pane-a", "tab-a", "/repo/other.ts"),
			"pane-b": createFileViewerPane("pane-b", "tab-b", "/repo/file.ts"),
			"pane-c": createFileViewerPane("pane-c", "tab-c", "/repo/file.ts"),
		};

		const result = findReusableFileViewerPane({
			workspaceId: "ws-1",
			activeTabId: "tab-a",
			tabs,
			panes,
			tabHistoryStacks: { "ws-1": ["tab-c", "tab-b"] },
			reuseExisting: "workspace",
			options: {
				filePath: "/repo/file.ts",
				diffCategory: "unstaged",
			},
		});

		expect(result?.id).toBe("pane-c");
	});
});

describe("fileViewerTargetsMatch", () => {
	it("matches remote urls with only a trailing slash difference", () => {
		expect(
			fileViewerTargetsMatch(
				{
					filePath: "https://example.com/files/readme.md/",
					diffCategory: undefined,
					commitHash: undefined,
				},
				{
					filePath: "https://example.com/files/readme.md",
					diffCategory: undefined,
					commitHash: undefined,
				},
			),
		).toBe(true);
	});

	it("does not normalize distinct remote urls beyond the trailing slash", () => {
		expect(
			fileViewerTargetsMatch(
				{
					filePath: "https://example.com/files//readme.md",
					diffCategory: undefined,
					commitHash: undefined,
				},
				{
					filePath: "https://example.com/files/readme.md",
					diffCategory: undefined,
					commitHash: undefined,
				},
			),
		).toBe(false);
	});
});

describe("applyFileViewerOpenOptionsToPane", () => {
	it("updates matching file viewers without losing pinned or renamed state", () => {
		const pane: Pane = {
			id: "pane-a",
			tabId: "tab-a",
			type: "file-viewer",
			name: "file.ts",
			fileViewer: {
				filePath: "/repo/file.ts",
				viewMode: "raw",
				isPinned: false,
				diffLayout: "inline",
				diffCategory: "unstaged",
				initialLine: 3,
			},
		};

		const result = applyFileViewerOpenOptionsToPane(pane, {
			filePath: "/repo/file.ts",
			diffCategory: "unstaged",
			viewMode: "diff",
			line: 42,
			column: 7,
			isPinned: true,
		});

		expect(result.fileViewer).toEqual({
			filePath: "/repo/file.ts",
			viewMode: "diff",
			isPinned: true,
			diffLayout: "inline",
			diffCategory: "unstaged",
			initialLine: 42,
			initialColumn: 7,
		});
	});
});

describe("activatePaneInWorkspace", () => {
	const createTab = (id: string, layout: MosaicNode<string>): Tab => {
		return {
			id,
			name: id,
			workspaceId: "ws-1",
			layout,
			createdAt: 0,
		};
	};

	it("activates the pane's tab, focuses it, and acknowledges review status", () => {
		const tabs = [
			createTab("tab-a", "pane-a"),
			createTab("tab-b", {
				direction: "row",
				first: "pane-b",
				second: "pane-c",
				splitPercentage: 50,
			}),
		];
		const panes: Record<string, Pane> = {
			"pane-a": {
				id: "pane-a",
				tabId: "tab-a",
				type: "terminal",
				name: "Terminal",
			},
			"pane-b": {
				id: "pane-b",
				tabId: "tab-b",
				type: "file-viewer",
				name: "file.ts",
				status: "review",
				fileViewer: {
					filePath: "/repo/file.ts",
					viewMode: "diff",
					isPinned: true,
					diffLayout: "inline",
					diffCategory: "unstaged",
				},
			},
			"pane-c": {
				id: "pane-c",
				tabId: "tab-b",
				type: "terminal",
				name: "Terminal 2",
				status: "review",
			},
		};

		const result = activatePaneInWorkspace({
			workspaceId: "ws-1",
			paneId: "pane-b",
			tabs,
			panes,
			activeTabIds: { "ws-1": "tab-a" },
			focusedPaneIds: { "tab-a": "pane-a", "tab-b": "pane-c" },
			tabHistoryStacks: { "ws-1": ["tab-c"] },
		});

		expect(result).not.toBeNull();
		expect(result?.activeTabIds["ws-1"]).toBe("tab-b");
		expect(result?.focusedPaneIds["tab-b"]).toBe("pane-b");
		expect(result?.tabHistoryStacks["ws-1"]).toEqual(["tab-a", "tab-c"]);
		expect(result?.panes["pane-b"].status).toBe("idle");
		expect(result?.panes["pane-c"].status).toBe("idle");
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

describe("createChatPane", () => {
	it("seeds a session id when the pane is created", () => {
		const pane = createChatPane("tab-1");

		expect(pane.type).toBe("chat");
		expect(typeof pane.chat?.sessionId).toBe("string");
		expect((pane.chat?.sessionId ?? "").length).toBeGreaterThan(0);
		expect(pane.chat?.launchConfig ?? null).toBeNull();
	});

	it("stores launch config when provided", () => {
		const pane = createChatPane("tab-1", {
			launchConfig: {
				initialPrompt: "hello",
				metadata: { model: "gpt-5" },
				retryCount: 2,
			},
		});

		expect(pane.chat?.launchConfig).toEqual({
			initialPrompt: "hello",
			metadata: { model: "gpt-5" },
			retryCount: 2,
		});
	});
});
