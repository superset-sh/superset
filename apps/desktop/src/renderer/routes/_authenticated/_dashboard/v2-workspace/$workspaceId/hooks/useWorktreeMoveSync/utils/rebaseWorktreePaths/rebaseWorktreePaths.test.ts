import { describe, expect, test } from "bun:test";
import type { WorkspaceState } from "@superset/panes";
import type { PaneViewerData } from "../../../../types";
import { rebaseWorktreePath, rebaseWorktreePaths } from "./rebaseWorktreePaths";

const from = "/wt/superset/billowy-hyphen-d7926629";
const to = "/wt/superset/fix-login-d7926629";

describe("rebaseWorktreePath", () => {
	test("moves the root and paths under it", () => {
		expect(rebaseWorktreePath(from, from, to)).toBe(to);
		expect(rebaseWorktreePath(`${from}/src/a.ts`, from, to)).toBe(
			`${to}/src/a.ts`,
		);
	});

	test("leaves a sibling that shares the prefix", () => {
		expect(rebaseWorktreePath(`${from}-2/a.ts`, from, to)).toBe(
			`${from}-2/a.ts`,
		);
	});
});

describe("rebaseWorktreePaths", () => {
	test("rewrites file panes and recently viewed files only", () => {
		const layout: WorkspaceState<PaneViewerData> = {
			version: 1,
			activeTabId: "t",
			tabs: [
				{
					id: "t",
					createdAt: 0,
					activePaneId: "f",
					layout: { type: "pane", paneId: "f" },
					panes: {
						f: {
							id: "f",
							kind: "file",
							data: { filePath: `${from}/a.ts`, mode: "editor" },
						},
						d: {
							id: "d",
							kind: "diff",
							data: { path: "a.ts", collapsedFiles: [] },
						},
					},
				},
			],
		};
		const state = {
			paneLayout: layout,
			recentlyViewedFiles: [{ absolutePath: `${from}/b.ts` }],
		};
		expect(rebaseWorktreePaths(state, from, to)).toBe(true);
		expect(rebaseWorktreePaths(state, from, to)).toBe(false);
		expect(layout.tabs[0]?.panes.f?.data).toEqual({
			filePath: `${to}/a.ts`,
			mode: "editor",
		});
		expect(layout.tabs[0]?.panes.d?.data).toEqual({
			path: "a.ts",
			collapsedFiles: [],
		});
		expect(state.recentlyViewedFiles[0]?.absolutePath).toBe(`${to}/b.ts`);
	});
});
